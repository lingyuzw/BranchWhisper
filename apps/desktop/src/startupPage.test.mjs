import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const startupHtmlPath = resolve("apps/desktop/src/startup.html");
const desktopMainPath = resolve("apps/desktop/src-tauri/src/main.rs");
const desktopCargoPath = resolve("apps/desktop/src-tauri/Cargo.toml");

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

test("desktop shell hides to background and exposes tray restore and quit actions", async () => {
  const main = await readFile(desktopMainPath, "utf8");

  assert.match(main, /use tauri::menu::MenuBuilder/);
  assert.match(main, /use tauri::tray::\{MouseButton,\s*TrayIconBuilder,\s*TrayIconEvent\}/);
  assert.match(main, /use std::sync::atomic::\{AtomicBool,[^}]*Ordering\}/);
  assert.match(main, /static IS_QUITTING:\s*AtomicBool\s*=\s*AtomicBool::new\(false\)/);
  assert.match(main, /setup_tray\(app\)/);
  assert.match(main, /WindowEvent::CloseRequested\s*\{\s*api,\s*\.\.\s*\}/);
  assert.match(main, /if IS_QUITTING\.load\(Ordering::SeqCst\)\s*\{\s*return;\s*\}/s);
  assert.match(main, /api\.prevent_close\(\)/);
  assert.match(main, /window\.hide\(\)/);
  assert.match(main, /const TRAY_SHOW_ID:\s*&str\s*=\s*"show"/);
  assert.match(main, /const TRAY_QUIT_ID:\s*&str\s*=\s*"quit"/);
  assert.match(main, /event\.id\(\)\.as_ref\(\)\s*==\s*TRAY_SHOW_ID/);
  assert.match(main, /event\.id\(\)\.as_ref\(\)\s*==\s*TRAY_QUIT_ID/);
  assert.match(main, /IS_QUITTING\.store\(true,\s*Ordering::SeqCst\)/);
  assert.match(main, /app\.exit\(0\)/);
  assert.match(main, /show_main_window\(app\)/);
});

test("desktop shell enforces a single running app instance and restores the existing window", async () => {
  const [main, cargo] = await Promise.all([
    readFile(desktopMainPath, "utf8"),
    readFile(desktopCargoPath, "utf8"),
  ]);

  assert.match(cargo, /tauri-plugin-single-instance\s*=\s*\{\s*version\s*=\s*"2"/);
  assert.match(main, /\.plugin\(tauri_plugin_single_instance::init\(/);
  assert.match(main, /show_main_window\(app\)/);
});

test("desktop tray right click opens only the menu instead of stealing focus", async () => {
  const main = await readFile(desktopMainPath, "utf8");

  assert.match(main, /TrayIconEvent::Click\s*\{\s*button:\s*MouseButton::Left,[\s\S]*?\}\s*\|\s*TrayIconEvent::DoubleClick\s*\{\s*button:\s*MouseButton::Left,/);
  assert.doesNotMatch(main, /TrayIconEvent::Click\s*\{\s*\.\.\s*\}\s*\|\s*TrayIconEvent::DoubleClick\s*\{\s*\.\.\s*\}/);
});

test("desktop shell stops only the backend process it started when quitting", async () => {
  const main = await readFile(desktopMainPath, "utf8");

  assert.match(main, /use std::sync::atomic::\{AtomicBool,\s*AtomicU32,\s*Ordering\}/);
  assert.match(main, /static STARTED_BACKEND_PID:\s*AtomicU32\s*=\s*AtomicU32::new\(0\)/);
  assert.match(main, /remember_started_backend\(&process\)/);
  assert.match(main, /fn remember_started_backend\(process:\s*&StartedBackendProcess\)/);
  assert.match(main, /STARTED_BACKEND_PID\.store\(process\.pid,\s*Ordering::SeqCst\)/);
  assert.match(main, /shutdown_started_backend_process\(\);[\s\S]*app\.exit\(0\)/);
  assert.match(main, /STARTED_BACKEND_PID\.swap\(0,\s*Ordering::SeqCst\)/);
  assert.match(main, /Command::new\("taskkill"\)/);
  assert.match(main, /\.args\(\["\/PID",\s*&pid_text,\s*"\/F",\s*"\/T"\]\)/);
  assert.doesNotMatch(main, /taskkill[\s\S]*branchwhisper-backend\.exe/);
});
