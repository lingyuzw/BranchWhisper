import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const startupHtmlPath = resolve("apps/desktop/src/startup.html");
const desktopMainPath = resolve("apps/desktop/src-tauri/src/main.rs");

test("startup page exposes a desktop-grade recovery surface", async () => {
  const html = await readFile(startupHtmlPath, "utf8");

  assert.match(html, /data-startup-status/);
  assert.match(html, /BranchWhisper 正在启动/);
  assert.match(html, /进入 API 模式/);
  assert.match(html, /重新检测/);
  assert.match(html, /复制启动命令/);
  assert.match(html, /复制日志路径/);
  assert.match(html, /导出诊断报告/);
  assert.match(html, /data-copy-target="command"/);
  assert.match(html, /data-copy-target="log-path"/);
  assert.match(html, /data-startup-detail/);
  assert.match(html, /data-repair-hints/);
});

test("startup page is a desktop app hub instead of the legacy chat page", async () => {
  const html = await readFile(startupHtmlPath, "utf8");

  assert.match(html, /BranchWhisper 控制台/);
  assert.match(html, /API 快速模式/);
  assert.match(html, /添加微信/);
  assert.match(html, /人格设定/);
  assert.match(html, /对话数据/);
  assert.match(html, /任务提醒/);
  assert.match(html, /数据统计/);
  assert.match(html, /平台日志/);
  assert.match(html, /data-route="\/app\/setup"/);
  assert.match(html, /data-route="\/app\/integrations"/);
  assert.match(html, /data-route="\/app\/diagnostics"/);
});

test("desktop shell keeps the hub visible after backend readiness", async () => {
  const main = await readFile(desktopMainPath, "utf8");

  assert.match(main, /windows_subsystem = "windows"/);
  assert.doesNotMatch(main, /window\.navigate\(url\)/);
  assert.match(main, /DesktopStartupStatus::ready/);
  assert.match(main, /DesktopStartupStatus::reusing/);
});
