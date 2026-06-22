import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const startupHtmlPath = resolve("apps/desktop/src/startup.html");

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
