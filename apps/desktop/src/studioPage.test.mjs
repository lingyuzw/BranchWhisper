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

test("studio opens advanced web console without replacing the Studio window", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /function openAdvancedRoute\(route\)/);
  assert.match(html, /window\.open\(url,\s*"_blank"/);
  assert.match(html, /window\.navigator\.clipboard\.writeText\(url\)/);
  assert.doesNotMatch(html, /window\.location\.assign\(resolveAdvancedRoute/);
  assert.doesNotMatch(html, /if \(!opened\)/);
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

test("studio api page is wired to backend config instead of static placeholders", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /data-api-provider-modal/);
  assert.match(html, /data-api-provider="qwen"/);
  assert.match(html, /data-api-provider="deepseek"/);
  assert.match(html, /data-api-provider="openai"/);
  assert.match(html, /data-api-provider="custom"/);
  assert.match(html, /data-api-name-input/);
  assert.match(html, /data-api-url-input/);
  assert.match(html, /data-api-model-input/);
  assert.match(html, /data-api-key-input/);
  assert.match(html, /data-api-temperature-input/);
  assert.match(html, /data-api-max-tokens-input/);
  assert.match(html, /data-api-load/);
  assert.match(html, /data-api-save/);
  assert.match(html, /data-api-test/);
  assert.match(html, /data-api-status/);
  assert.match(html, /api_llm_api_key_set/);
  assert.match(html, /api_llm_api_key_masked/);
  assert.match(html, /backendRequest\(\{\s*path:\s*"\/api\/config"\s*\}\)/s);
  assert.match(html, /backendRequest\(\{\s*method:\s*"PATCH",\s*path:\s*"\/api\/config"/s);
  assert.match(html, /backendRequest\(\{\s*method:\s*"POST",\s*path:\s*"\/api\/diagnostics\/llm-api-test"/s);
  assert.match(html, /dialog_mode:\s*"api"/);
  assert.doesNotMatch(html, /后续接后端配置保存/);
});

test("studio API page exposes real provider configuration controls", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /data-api-provider-modal/);
  for (const provider of ["qwen", "deepseek", "openai", "custom"]) {
    assert.match(html, new RegExp(`data-api-provider="${provider}"`));
  }

  for (const selector of [
    "data-api-name-input",
    "data-api-url-input",
    "data-api-model-input",
    "data-api-key-input",
    "data-api-temperature-input",
    "data-api-max-tokens-input",
    "data-api-load",
    "data-api-save",
    "data-api-test",
    "data-api-status",
    "data-api-secret-state",
  ]) {
    assert.match(html, new RegExp(selector));
  }

  assert.match(html, /api_llm_api_key_set/);
  assert.match(html, /api_llm_api_key_masked/);
  assert.doesNotMatch(html, /后续接后端配置保存/);
});

test("studio API page wires backend config load save and live test without exposing masked keys", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /function backendOrigin\(\)/);
  assert.match(html, /currentStatus\.app_url \|\| defaultAppUrl/);
  assert.match(html, /return url\.origin/);
  assert.match(html, /function backendRequest\(\{\s*method = "GET",\s*path,\s*body\s*\}\)/);
  assert.match(html, /fetch\(`\$\{backendOrigin\(\)\}\$\{path\}`/);
  assert.match(html, /"Content-Type": "application\/json"/);
  assert.match(html, /if \(!response\.ok\)/);

  assert.match(html, /async function loadApiConfig\(\)/);
  assert.match(html, /backendRequest\(\{\s*path: "\/api\/config"\s*\}\)/);
  assert.match(html, /apiKeyInput\.placeholder = apiKeyMasked/);
  assert.doesNotMatch(html, /apiKeyInput\.value\s*=\s*[^;]*api_llm_api_key_masked/);

  assert.match(html, /async function saveApiConfig\(\)/);
  assert.match(html, /method: "PATCH"/);
  assert.match(html, /path: "\/api\/config"/);
  for (const key of ["dialog_mode", "api_llm_url", "api_llm_model", "api_llm_api_key", "api_temperature", "api_max_tokens"]) {
    assert.match(html, new RegExp(`${key}:`));
  }

  assert.match(html, /async function testApiConfig\(\)/);
  assert.match(html, /method: "POST"/);
  assert.match(html, /path: "\/api\/diagnostics\/llm-api-test"/);
  assert.match(html, /if \(!apiKeyInput\.value\.trim\(\)\)/);
  assert.match(html, /if \(next === "api"\) \{\s*loadApiConfig\(\);/s);
});

test("studio Bot page creates loads and saves real bot profiles", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  for (const selector of [
    "data-bot-profile-list",
    "data-bot-id-input",
    "data-bot-name-input",
    "data-bot-system-input",
    "data-bot-reply-style-input",
    "data-bot-tools-enabled",
    "data-bot-load",
    "data-bot-create",
    "data-bot-save",
    "data-bot-status",
    "data-bot-count",
    "data-bot-selected-name",
    "data-bot-bridge-provider-input",
    "data-bot-bridge-integration-input",
    "data-bot-bridge-url-input",
    "data-bot-bridge-enabled",
    "data-bot-bridge-status",
    "data-bot-bridge-test",
    "data-bot-bridge-start",
    "data-bot-bridge-stop",
    "data-bot-bridge-restart",
    "data-bot-bridge-logs-refresh",
    "data-bot-bridge-logs-clear",
    "data-bot-bridge-logs-copy",
    "data-bot-bridge-log",
  ]) {
    assert.match(html, new RegExp(selector));
  }

  assert.match(html, /let botProfiles = \[\]/);
  assert.match(html, /let selectedBotProfileId = "default"/);
  assert.match(html, /async function loadBotProfiles\(\)/);
  assert.match(html, /function renderBotProfiles\(\)/);
  assert.match(html, /function currentBotProfilePayload\(\)/);
  assert.match(html, /async function createBotProfile\(\)/);
  assert.match(html, /async function saveBotProfile\(\)/);
  assert.match(html, /backendRequest\(\{\s*path:\s*"\/api\/bot-profiles"\s*\}\)/s);
  assert.match(html, /backendRequest\(\{\s*method:\s*"POST",\s*path:\s*"\/api\/bot-profiles"/s);
  assert.match(html, /backendRequest\(\{\s*method:\s*"PATCH",\s*path:\s*`\/api\/bot-profiles\/\$\{encodeURIComponent\(selectedBotProfileId\)\}`/s);
  assert.doesNotMatch(html, /等待创建/);
});

test("studio Bot page persists and detects the selected weixin bridge", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /function setBotBridgeStatus\(message,\s*tone = "warn"\)/);
  assert.match(html, /\.badge\.ok/);
  assert.match(html, /\.badge\.warn/);
  assert.match(html, /\.badge\.error/);
  assert.match(html, /\.badge\.run/);
  assert.match(html, /function selectedBotBridgeIntegrationId\(\)/);
  assert.match(html, /bridge_provider:\s*botBridgeProviderInput\?\.value\.trim\(\) \|\| "openclaw"/);
  assert.match(html, /bridge_integration_id:\s*selectedBotBridgeIntegrationId\(\)/);
  assert.match(html, /bridge_url:\s*botBridgeUrlInput\?\.value\.trim\(\) \|\| ""/);
  assert.match(html, /bridge_enabled:\s*Boolean\(botBridgeEnabledInput\?\.checked\)/);
  assert.match(html, /botBridgeProviderInput\.value = current\.bridge_provider \|\| "openclaw"/);
  assert.match(html, /botBridgeIntegrationInput\.value = current\.bridge_integration_id \|\| "weixin_personal"/);
  assert.match(html, /botBridgeUrlInput\.value = current\.bridge_url \|\| ""/);
  assert.match(html, /botBridgeEnabledInput\.checked = current\.bridge_enabled === true/);
  assert.match(html, /async function testBotBridge\(\)/);
  assert.match(html, /backendRequest\(\{\s*path:\s*"\/api\/integrations"\s*\}\)/s);
  assert.match(html, /integrations\.find\(\(item\) => item\.id === integrationId\)/);
  assert.match(html, /setBotBridgeLog\(detail\)/);
  assert.match(html, /data-bot-bridge-test/);
});

test("studio Bot save synchronizes the integration runtime binding", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /async function syncBotBridgeIntegration\(profileId\)/);
  assert.match(html, /const integrationId = selectedBotBridgeIntegrationId\(\)/);
  assert.match(html, /path:\s*`\/api\/integrations\/\$\{encodeURIComponent\(integrationId\)\}`/);
  assert.match(html, /bot_profile_id:\s*profileId \|\| selectedBotProfileId/);
  assert.match(html, /enabled:\s*Boolean\(botBridgeEnabledInput\?\.checked\)/);
  assert.match(html, /await syncBotBridgeIntegration\(result\.profile\?\.id \|\| selectedBotProfileId\)/);
});

test("studio Bot bridge detection does not mark disabled integrations as usable", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(
    html,
    /if \(!integration\.enabled\) \{\s*setBotBridgeStatus\("未启用", "warn"\);[\s\S]*\} else if \(\["running", "login", "logged_in"\]\.includes\(status\) \|\| accounts > 0\) \{/,
  );
});

test("studio Bot selection resets bridge logs for the selected profile", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /setBotBridgeLog\(`等待检测当前 Bot：\$\{current\.name \|\| current\.id \|\| "当前 Bot"\}\\n集成实例：\$\{current\.bridge_integration_id \|\| "weixin_personal"\}`\)/);
});

test("studio Bot page controls bridge runtime and logs through integration APIs", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /async function controlBotBridge\(action\)/);
  assert.match(html, /const runtimePaths = \{\s*start:\s*`\/api\/integrations\/\$\{encodeURIComponent\(integrationId\)\}\/bridge\/start`,\s*stop:\s*`\/api\/integrations\/\$\{encodeURIComponent\(integrationId\)\}\/stop`,\s*restart:\s*`\/api\/integrations\/\$\{encodeURIComponent\(integrationId\)\}\/restart`/s);
  assert.match(html, /await loadBotBridgeLogs\(\)/);
  assert.match(html, /async function loadBotBridgeLogs\(\)/);
  assert.match(html, /path:\s*`\/api\/integrations\/\$\{encodeURIComponent\(integrationId\)\}\/logs\?max_bytes=64000&scope=current`/);
  assert.match(html, /async function clearBotBridgeLogs\(\)/);
  assert.match(html, /method:\s*"DELETE",\s*path:\s*`\/api\/integrations\/\$\{encodeURIComponent\(integrationId\)\}\/logs`/s);
  assert.match(html, /async function copyBotBridgeLogs\(\)/);
  assert.match(html, /navigator\.clipboard\.writeText\(botBridgeLog\?\.textContent \|\| ""\)/);
  for (const action of ["start", "stop", "restart", "logs-refresh", "logs-clear", "logs-copy"]) {
    assert.match(html, new RegExp(`data-bot-bridge-${action}`));
  }
});

test("studio Bot bridge start persists the selected Bot before launching", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /async function persistBotProfileForBridgeRun\(\)/);
  assert.match(html, /const payload = currentBotProfileUpdatePayload\(\);/);
  assert.match(html, /method:\s*"PATCH",\s*path:\s*`\/api\/bot-profiles\/\$\{encodeURIComponent\(selectedBotProfileId\)\}`,\s*body:\s*payload/s);
  assert.match(
    html,
    /const persistedProfileId = await persistBotProfileForBridgeRun\(\);[\s\S]*if \(!persistedProfileId\) \{[\s\S]*return null;[\s\S]*\}[\s\S]*const synced = await syncBotBridgeIntegration\(persistedProfileId\);/s,
  );
});

test("studio Bot bridge start lets backend resolve the BranchWhisper callback URL", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /const result = await backendRequest\(\{\s*method:\s*"POST",\s*path\s*\}\)/);
  assert.doesNotMatch(html, /branchwhisper_url:\s*botBridgeUrlInput\.value\.trim\(\)/);
});

test("studio Bot log copy failure preserves the current log text", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const copyFunction = html.match(/async function copyBotBridgeLogs\(\) \{[\s\S]*?\n      \}/)?.[0] || "";

  assert.match(copyFunction, /async function copyBotBridgeLogs\(\)/);
  assert.match(copyFunction, /setBotBridgeStatus\("复制失败", "error"\)/);
  assert.doesNotMatch(copyFunction, /setBotBridgeLog\(/);
});

test("studio config page persists model personality separately from bot personality", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  for (const selector of [
    "data-model-system-input",
    "data-bot-persona-input",
    "data-config-selected-bot",
    "data-config-load",
    "data-config-save-model",
    "data-config-save-bot",
    "data-config-status",
  ]) {
    assert.match(html, new RegExp(selector));
  }

  assert.match(html, /async function loadDesktopConfig\(\)/);
  assert.match(html, /async function saveModelSystemConfig\(\)/);
  assert.match(html, /async function saveBotPersonaConfig\(\)/);
  assert.match(html, /backendRequest\(\{\s*path:\s*"\/api\/config"\s*\}\)/s);
  assert.match(html, /backendRequest\(\{\s*method:\s*"PATCH",\s*path:\s*"\/api\/config",\s*body:\s*\{\s*system:/s);
  assert.match(html, /backendRequest\(\{\s*method:\s*"PATCH",\s*path:\s*`\/api\/bot-profiles\/\$\{encodeURIComponent\(selectedBotProfileId\)\}`/s);
  assert.match(html, /if \(next === "bot"\) \{\s*loadBotProfiles\(\);/s);
  assert.match(html, /if \(next === "config"\) \{\s*loadDesktopConfig\(\);/s);
  assert.doesNotMatch(html, /data-panel="config"[\s\S]*配置分组[\s\S]*后续接入后端后/);
});

test("studio Bot creation avoids reposting the selected default profile", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /function uniqueBotProfileId\(/);
  assert.match(html, /function currentBotProfileCreatePayload\(\)/);
  assert.match(html, /const payload = currentBotProfileCreatePayload\(\);/);
  assert.match(html, /if \(botProfiles\.some\(\(profile\) => profile\.id === payload\.id\)\)/);
  assert.match(html, /payload\.id = uniqueBotProfileId\(payload\.id,\s*payload\.name\);/);
  assert.doesNotMatch(html, /async function createBotProfile\(\)[\s\S]*const payload = currentBotProfilePayload\(\);/);
});

test("studio Bot save treats profile id as immutable instead of silently dropping edits", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /botIdInput\.readOnly = true/);
  assert.match(html, /function currentBotProfileUpdatePayload\(\)/);
  assert.match(html, /const payload = currentBotProfileUpdatePayload\(\);/);
  assert.doesNotMatch(html, /async function saveBotProfile\(\)[\s\S]*const payload = currentBotProfilePayload\(\);/);
});

test("studio config load keeps an error state when either backend config or bot profiles fail", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /const \[config,\s*profiles\]\s*=\s*await Promise\.all\(\[loadApiConfig\(\),\s*loadBotProfiles\(\)\]\)/);
  assert.match(html, /if \(!config \|\| !profiles\) \{/);
  assert.match(html, /setConfigStatus\("配置未完整加载，请检查后端连接后重试。",\s*"error"\);/);
  assert.doesNotMatch(html, /const \[config\]\s*=\s*await Promise\.all\(\[loadApiConfig\(\), loadBotProfiles\(\)\]\);[\s\S]*setConfigStatus\("已加载模型人格和当前 Bot 人格。", "ok"\);/);
});
