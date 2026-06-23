import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const studioHtmlPath = resolve("apps/desktop/src/studio.html");
const tauriConfigPath = resolve("apps/desktop/src-tauri/tauri.conf.json");

test("desktop app opens to BranchWhisper Studio instead of legacy web console", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const config = JSON.parse(await readFile(tauriConfigPath, "utf8"));

  assert.equal(config.app.windows[0].url, "studio.html");
  assert.match(html, /BranchWhisper Studio/);
  assert.match(html, /data-studio-root/);
  assert.match(html, /data-mode="api"/);
  assert.match(html, /data-mode="local"/);
  assert.match(html, /Use API/);
  assert.match(html, /Configure Local Runtime/);
  assert.doesNotMatch(html, /window\.location\.href\s*=\s*appRoute/);
});

test("studio keeps advanced web console explicit", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /Advanced Web Console/);
  assert.match(html, /data-advanced-route="\/app\/"/);
  assert.doesNotMatch(html, /<meta[^>]+http-equiv="refresh"/i);
});

test("recommended mode card does not reuse primary button styling", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /class="mode-card recommended active"/);
  assert.match(html, /\.mode-card\.recommended/);
  assert.doesNotMatch(html, /class="mode-card primary/);
});

test("studio uses the management app navigation requested for the first desktop preview", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /data-layout="management-app"/);
  assert.match(html, /data-workspace="bot"/);
  assert.match(html, /Bot 工作台/);
  assert.match(html, /Chat/);
  assert.match(html, /data-language-toggle/);
  assert.match(html, /data-theme-toggle/);
  assert.match(html, /data-system-settings/);

  for (const label of [
    "引导",
    "API",
    "Bot",
    "配置文件",
    "对话数据",
    "素材库",
    "自定义规则",
    "未来任务",
    "数据统计",
    "平台日志",
    "诊断中心",
    "系统设置",
  ]) {
    assert.match(html, new RegExp(label));
  }
});

test("studio reuses BranchWhisper web theme tokens without a black sidebar split", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /--bg:\s*#f6f4ef/);
  assert.match(html, /--bg-elevated:\s*#eeebe3/);
  assert.match(html, /--surface:\s*#fffdf8/);
  assert.match(html, /--primary:\s*#9a6b34/);
  assert.match(html, /--dark-bg:\s*#171912/);
  assert.match(html, /--dark-surface:\s*#28281f/);
  assert.match(html, /--dark-primary:\s*#d6b56d/);
  assert.doesNotMatch(html, /\.studio-nav\s*\{[^}]*background:\s*var\(--dark\)/s);
  assert.doesNotMatch(html, /#20251f/);
});

test("studio guide page gives beginner API and local setup tracks", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /API 轻量部署/);
  assert.match(html, /本地完整部署/);
  assert.match(html, /不装本地环境也能先跑通/);
  assert.match(html, /新增 API/);
  assert.match(html, /创建微信 Bot/);
  assert.match(html, /测试对话/);
  assert.match(html, /WSL/);
  assert.match(html, /conda/);
  assert.match(html, /CUDA/);
});

test("studio top bar keeps the title from being squeezed by right actions", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /grid-template-columns:\s*auto minmax\(180px,\s*1fr\) auto/);
  assert.match(html, /\.topbar-title\s*\{[^}]*text-align:\s*left/s);
  assert.doesNotMatch(html, /grid-template-columns:\s*minmax\(220px,\s*1fr\) auto minmax\(220px,\s*1fr\)/);
});

test("studio right rail is contextual instead of appearing on every page", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /data-rail="guide"/);
  assert.match(html, /\.studio-shell\[data-rail="hidden"\]\s+\.workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(html, /\.studio-shell\[data-rail="hidden"\]\s+\.right-rail\s*\{[^}]*display:\s*none/s);
  assert.match(html, /const railPages = new Set\(\["guide", "diagnostics"\]\)/);
  assert.match(html, /root\.dataset\.rail = railPages\.has\(next\) \? next : "hidden"/);
});
