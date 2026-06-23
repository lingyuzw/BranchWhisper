import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const studioHtmlPath = resolve("apps/desktop/src/studio.html");
const tauriConfigPath = resolve("apps/desktop/src-tauri/tauri.conf.json");

function extractScriptFunction(script, functionName) {
  const start = script.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const bodyStart = script.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `${functionName} should have a body`);
  let depth = 0;
  for (let index = bodyStart; index < script.length; index += 1) {
    const char = script[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return script.slice(start, index + 1);
      }
    }
  }
  throw new Error(`${functionName} body was not closed`);
}

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
    "data-bot-delete",
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
    "data-bot-bridge-login-qr",
    "data-bot-bridge-login-poll",
    "data-bot-bridge-verify-input",
    "data-bot-bridge-qr-image",
    "data-bot-bridge-login-status",
    "data-bot-bridge-account",
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

test("studio Bot page edits auto reply guard settings for safer weixin rollout", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  for (const selector of [
    "data-bot-auto-reply-enabled",
    "data-bot-group-replies-enabled",
    "data-bot-allowlist-input",
    "data-bot-blocklist-input",
    "data-bot-reply-guard-summary",
  ]) {
    assert.match(html, new RegExp(selector));
  }
  assert.match(html, /const botAutoReplyEnabledInput = document\.querySelector\("\[data-bot-auto-reply-enabled\]"\)/);
  assert.match(html, /const botGroupRepliesEnabledInput = document\.querySelector\("\[data-bot-group-replies-enabled\]"\)/);
  assert.match(html, /function splitBotReplyList\(value\)/);
  assert.match(html, /function formatBotReplyList\(items\)/);
  assert.match(html, /auto_reply_enabled:\s*Boolean\(botAutoReplyEnabledInput\?\.checked\)/);
  assert.match(html, /allow_group_chats:\s*Boolean\(botGroupRepliesEnabledInput\?\.checked\)/);
  assert.match(html, /reply_allowlist:\s*splitBotReplyList\(botAllowlistInput\?\.value\)/);
  assert.match(html, /reply_blocklist:\s*splitBotReplyList\(botBlocklistInput\?\.value\)/);
  assert.match(html, /botAutoReplyEnabledInput\.checked = current\.auto_reply_enabled !== false/);
  assert.match(html, /botGroupRepliesEnabledInput\.checked = current\.allow_group_chats === true/);
  assert.match(html, /botReplyGuardSummary\.textContent = replyGuardSummary\(current\)/);
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
  assert.match(html, /navigator\.clipboard\.writeText\(botBridgeLogFullText \|\| botBridgeLog\?\.textContent \|\| ""\)/);
  for (const action of ["start", "stop", "restart", "logs-refresh", "logs-clear", "logs-copy"]) {
    assert.match(html, new RegExp(`data-bot-bridge-${action}`));
  }
});

test("studio Bot bridge logs stay compact with expandable full details", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /class="bridge-log-shell"/);
  assert.match(html, /data-bot-bridge-log-summary/);
  assert.match(html, /data-bot-bridge-log-toggle/);
  assert.match(html, /data-bot-bridge-log-collapsed/);
  assert.match(html, /\.bridge-log-shell/);
  assert.match(html, /\.bridge-log-shell\.expanded \.bridge-log/);
  assert.match(html, /\.bridge-log \{\s*max-height:/s);
  assert.match(html, /function setBotBridgeLog\(message\) \{[\s\S]*botBridgeLogFullText = text/s);
  assert.match(html, /function updateBotBridgeLogView\(\)/);
  assert.match(html, /function summarizeBotBridgeLog\(text\)/);
  assert.match(html, /navigator\.clipboard\.writeText\(botBridgeLogFullText \|\| botBridgeLog\?\.textContent \|\| ""\)/);
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

test("studio Bot page deletes non-default profiles through the backend", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /async function deleteBotProfile\(\)/);
  assert.match(html, /if \(selectedBotProfileId === "default"\)/);
  assert.match(html, /method:\s*"DELETE",\s*path:\s*`\/api\/bot-profiles\/\$\{encodeURIComponent\(selectedBotProfileId\)\}`/s);
  assert.match(html, /selectedBotProfileId = botProfiles\[0\]\?\.id \|\| "default"/);
  assert.match(html, /data-bot-delete/);
  assert.match(html, /event\.target\.closest\("\[data-bot-delete\]"\)[\s\S]*deleteBotProfile\(\)/);
});

test("studio Bot page supports QR login and polling for the selected bridge", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /async function requestBotBridgeLoginQr\(\)/);
  assert.match(html, /method:\s*"POST",\s*path:\s*`\/api\/integrations\/\$\{encodeURIComponent\(integrationId\)\}\/login\/qr`,\s*body:\s*\{\s*force:\s*true\s*\}/s);
  assert.match(html, /async function pollBotBridgeLogin\(\)/);
  assert.match(html, /method:\s*"POST",\s*path:\s*`\/api\/integrations\/\$\{encodeURIComponent\(integrationId\)\}\/login\/poll`,\s*body:\s*\{\s*verify_code:/s);
  assert.match(html, /function renderBotBridgeLogin\(login\)/);
  assert.match(html, /qrcode_img_content/);
  assert.match(html, /data-bot-bridge-login-qr/);
  assert.match(html, /data-bot-bridge-login-poll/);
  assert.match(html, /event\.target\.closest\("\[data-bot-bridge-login-qr\]"\)[\s\S]*requestBotBridgeLoginQr\(\)/);
  assert.match(html, /event\.target\.closest\("\[data-bot-bridge-login-poll\]"\)[\s\S]*pollBotBridgeLogin\(\)/);
});

test("studio Bot QR login renders non-image QR payloads as scannable QR codes", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /<script src="qrcode-generator\.js"><\/script>/);
  assert.match(html, /function normalizeQrImageSource\(imageContent\)/);
  assert.match(html, /value\.startsWith\("data:"\)/);
  assert.match(html, /function renderLocalQrSvgDataUrl\(text\)/);
  assert.match(html, /QRCode\.create\(text/);
  assert.match(html, /qrcode\(0,\s*"M"\)/);
  assert.match(html, /localQr\.addData\(String\(text\),\s*"Byte"\)/);
  assert.match(html, /data:image\/svg\+xml;charset=utf-8,/);
  assert.doesNotMatch(html, /api\.qrserver\.com\/v1\/create-qr-code/);
  assert.doesNotMatch(html, /return `data:image\/png;base64,\$\{value\}`/);
});

test("studio Bot QR login displays raw base64 QR images without re-encoding them", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  const detectSource = extractScriptFunction(script, "detectBase64ImageMime");
  const normalizeSource = extractScriptFunction(script, "normalizeQrImageSource");
  const normalizeQrImageSource = Function(
    "renderLocalQrSvgDataUrl",
    `${detectSource}; ${normalizeSource}; return normalizeQrImageSource;`,
  )(() => "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E");

  const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

  assert.equal(
    normalizeQrImageSource(tinyPngBase64),
    `data:image/png;base64,${tinyPngBase64}`,
  );
});

test("studio Bot QR login starts polling and displays account details", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /let botBridgeLoginPollTimer = null/);
  assert.match(html, /function startBotBridgeLoginPolling\(\)/);
  assert.match(html, /botBridgeLoginPollTimer = window\.setInterval\(\(\) => \{\s*pollBotBridgeLogin\(\{ silent: true \}\);/s);
  assert.match(html, /function stopBotBridgeLoginPolling\(\)/);
  assert.match(html, /startBotBridgeLoginPolling\(integrationId\);/);
  assert.match(html, /if \(status === "created"\) \{[\s\S]*stopBotBridgeLoginPolling\(\);/s);
  assert.match(html, /const accountText = \[/);
  assert.match(html, /state\.account_id/);
  assert.match(html, /state\.base_url/);
  assert.match(html, /state\.user_id/);
  assert.match(html, /botBridgeAccount\.textContent = accountText/);
});

test("studio Bot QR login polling is bound to one active session", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /let botBridgeLoginPollIntegrationId = ""/);
  assert.match(html, /let botBridgeLoginPollInFlight = false/);
  assert.match(html, /botBridgeLoginPollIntegrationId = ""/);
  assert.match(html, /const integrationId = arguments\[0\] \|\| selectedBotBridgeIntegrationId\(\)/);
  assert.match(html, /botBridgeLoginPollIntegrationId = integrationId/);
  assert.match(html, /const integrationId = options\.integrationId \|\| botBridgeLoginPollIntegrationId \|\| selectedBotBridgeIntegrationId\(\)/);
  assert.match(html, /if \(options\.silent && botBridgeLoginPollInFlight\) \{\s*return null;\s*\}/s);
  assert.match(html, /botBridgeLoginPollInFlight = true/);
  assert.match(html, /finally \{\s*botBridgeLoginPollInFlight = false;\s*\}/s);
  assert.match(html, /if \(login && login\.qrcode_img_content && !\["created", "expired", "cancel", "canceled", "denied", "verify_code_blocked", "error"\]\.includes\(String\(login\.status \|\| ""\)\)\) \{\s*startBotBridgeLoginPolling\(integrationId\);/s);
  assert.doesNotMatch(html, /const login = renderBotBridgeLogin\(payload\.result\?\.login\);\s*startBotBridgeLoginPolling\(\);/s);
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

test("studio conversation data page loads filters opens deletes and exports bot conversations", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  for (const selector of [
    "data-conversation-search",
    "data-conversation-load",
    "data-conversation-list",
    "data-conversation-thread",
    "data-conversation-delete",
    "data-conversation-export",
    "data-conversation-status",
    "data-conversation-selected-title",
    "data-conversation-count",
    "data-conversation-message-count",
    "data-conversation-last-updated",
  ]) {
    assert.match(html, new RegExp(selector));
  }

  assert.match(html, /let botConversations = \[\]/);
  assert.match(html, /let selectedConversationId = ""/);
  assert.match(html, /function isBotConversation\(conversation\)/);
  assert.match(html, /conversation\.metadata\?\.source/);
  assert.match(html, /conversation\.metadata\?\.platform_id/);
  assert.match(html, /conversation\.metadata\?\.sender_id/);
  assert.match(html, /async function loadBotConversations\(\)/);
  assert.match(html, /path:\s*`\/api\/conversations\?\$\{params\.toString\(\)\}`/);
  assert.match(html, /botConversations = conversations\.filter\(isBotConversation\)/);
  assert.match(html, /async function openBotConversation\(conversationId\)/);
  assert.match(html, /path:\s*`\/api\/conversations\/\$\{encodeURIComponent\(conversationId\)\}`/);
  assert.match(html, /async function deleteBotConversation\(\)/);
  assert.match(html, /method:\s*"DELETE",\s*path:\s*`\/api\/conversations\/\$\{encodeURIComponent\(selectedConversationId\)\}`/s);
  assert.match(html, /function exportBotConversation\(\)/);
  assert.match(html, /\/api\/conversations\/\$\{encodeURIComponent\(selectedConversationId\)\}\/export\.md/);
  assert.match(html, /if \(next === "conversations"\) \{\s*loadBotConversations\(\);/s);
  assert.match(html, /event\.target\.closest\("\[data-conversation-load\]"\)[\s\S]*loadBotConversations\(\)/);
  assert.match(html, /event\.target\.closest\("\[data-conversation-delete\]"\)[\s\S]*deleteBotConversation\(\)/);
  assert.match(html, /event\.target\.closest\("\[data-conversation-export\]"\)[\s\S]*exportBotConversation\(\)/);
});

test("studio conversation data page filters only bot or weixin conversation sources", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  const identitySource = extractScriptFunction(script, "conversationIdentity");
  const filterSource = extractScriptFunction(script, "isBotConversation");
  const { isBotConversation } = Function(
    `${identitySource}; ${filterSource}; return { isBotConversation };`,
  )();

  assert.equal(isBotConversation({ source: "weixin_oc", platform_id: "wx", sender_id: "alice" }), true);
  assert.equal(isBotConversation({ source: "openclaw", platform_id: "weixin", sender_id: "alice" }), true);
  assert.equal(isBotConversation({ source: "slack", platform_id: "workspace-1", sender_id: "alice" }), false);
  assert.equal(isBotConversation({ metadata: { source: "bot", platform_id: "weixin", sender_id: "alice" } }), true);
});

test("studio conversation data page searches bot metadata after backend query", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  const identitySource = extractScriptFunction(script, "conversationIdentity");
  const searchSource = extractScriptFunction(script, "conversationMatchesSearch");
  const { conversationMatchesSearch } = Function(
    `${identitySource}; ${searchSource}; return { conversationMatchesSearch };`,
  )();
  const conversation = {
    title: "晨间提醒",
    source: "weixin_oc",
    platform_id: "weixin",
    sender_id: "wxid_alice",
    last_message: "早安",
    summary: "天气提醒",
  };

  assert.equal(conversationMatchesSearch(conversation, "wxid_alice"), true);
  assert.equal(conversationMatchesSearch(conversation, "weixin"), true);
  assert.equal(conversationMatchesSearch(conversation, "天气"), true);
  assert.equal(conversationMatchesSearch(conversation, "不存在"), false);
  assert.match(html, /botConversations = conversations\.filter\(isBotConversation\)\.filter\(\(conversation\) => conversationMatchesSearch\(conversation,\s*query\)\)/);
});

test("studio conversation data page keeps layout robust for long content and mobile", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /\.conversation-message\s*\{[\s\S]*overflow-wrap:\s*anywhere/s);
  assert.match(html, /\.conversation-card small\s*\{[\s\S]*overflow-wrap:\s*anywhere/s);
  assert.match(html, /\.conversation-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(280px,\s*0\.75fr\) minmax\(0,\s*1\.25fr\)/s);
  assert.match(html, /@media \(max-width: 1180px\)[\s\S]*\.conversation-layout[\s\S]*grid-template-columns:\s*1fr/s);
  assert.match(html, /@media \(max-width: 780px\)[\s\S]*\.conversation-meta-grid[\s\S]*grid-template-columns:\s*1fr/s);
});

test("studio conversation delete does not remove local UI state when backend delete fails", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  const deleteSource = extractScriptFunction(script, "deleteBotConversation");

  assert.match(deleteSource, /if \(!result\.ok\) \{/);
  assert.match(deleteSource, /return result;/);
  assert.match(deleteSource, /botConversations = botConversations\.filter/);
  assert(
    deleteSource.indexOf("if (!result.ok)") < deleteSource.indexOf("botConversations = botConversations.filter"),
    "delete failure guard must run before mutating local list",
  );
});

test("studio conversation export tolerates missing clipboard API", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  const exportSource = extractScriptFunction(script, "exportBotConversation");

  assert.match(exportSource, /navigator\.clipboard\?\.writeText\?\.call\(navigator\.clipboard,\s*url\)\.catch\(\(\) => \{\}\)/);
  assert.doesNotMatch(exportSource, /navigator\.clipboard\.writeText\(url\)/);
});

test("studio platform logs page exposes filters actions and compact log display", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  for (const selector of [
    "data-platform-log-refresh",
    "data-platform-log-copy",
    "data-platform-log-errors-only",
    "data-platform-log-pause",
    "data-platform-log-toggle",
    "data-platform-log-summary",
    "data-platform-log-output",
    "data-platform-log-status",
    "data-platform-log-count",
    "data-platform-log-source-label",
  ]) {
    assert.match(html, new RegExp(selector));
  }

  for (const source of ["all", "app", "backend", "api", "bot", "bridge"]) {
    assert.match(html, new RegExp(`data-platform-log-source="${source}"`));
  }

  assert.match(html, /class="platform-log-shell"/);
  assert.match(html, /\.platform-log-shell\.expanded \.platform-log-output/);
  assert.match(html, /\.platform-log-output\s*\{[\s\S]*max-height:/s);
  assert.match(html, /\.platform-log-summary\s*\{[\s\S]*overflow-wrap:\s*anywhere/s);
});

test("studio platform logs page loads service and bridge logs through existing backend APIs", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /let platformLogs = \[\]/);
  assert.match(html, /let activePlatformLogSource = "all"/);
  assert.match(html, /let platformLogErrorsOnly = false/);
  assert.match(html, /let platformLogPaused = false/);
  assert.match(html, /async function loadPlatformLogs\(\)/);
  assert.match(html, /const serviceIds = \["asr", "llm", "tts"\]/);
  assert.match(html, /path:\s*`\/api\/services\/\$\{serviceId\}\/logs\?max_bytes=24000`/);
  assert.match(html, /backendRequest\(\{\s*path:\s*"\/api\/integrations"\s*\}\)/s);
  assert.match(html, /path:\s*`\/api\/integrations\/\$\{encodeURIComponent\(integration\.id\)\}\/logs\?max_bytes=64000&scope=current`/);
  assert.match(html, /if \(next === "logs"\) \{\s*loadPlatformLogs\(\);/s);
  assert.match(html, /event\.target\.closest\("\[data-platform-log-refresh\]"\)[\s\S]*loadPlatformLogs\(\)/);
  assert.match(html, /event\.target\.closest\("\[data-platform-log-copy\]"\)[\s\S]*copyPlatformLogs\(\)/);
  assert.match(html, /event\.target\.closest\("\[data-platform-log-errors-only\]"\)[\s\S]*platformLogErrorsOnly = !platformLogErrorsOnly/s);
  assert.match(html, /event\.target\.closest\("\[data-platform-log-pause\]"\)[\s\S]*platformLogPaused = !platformLogPaused/s);
});

test("studio platform logs parser classifies filters and summarizes noisy output", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  const entriesSource = extractScriptFunction(script, "platformLogEntriesFromText");
  const summarySource = extractScriptFunction(script, "summarizePlatformLogText");
  const { platformLogEntriesFromText, summarizePlatformLogText } = Function(
    `${entriesSource}; ${summarySource}; return { platformLogEntriesFromText, summarizePlatformLogText };`,
  )();

  const entries = platformLogEntriesFromText("bridge", "weixin_personal", "ok\nERROR failed to connect\nTraceback line");
  assert.equal(entries.length, 3);
  assert.equal(entries[0].status, "info");
  assert.equal(entries[1].status, "error");
  assert.equal(entries[2].status, "error");
  assert.equal(entries[1].source, "bridge");
  assert.equal(entries[1].label, "weixin_personal");

  const longText = Array.from({ length: 40 }, (_, index) => `line-${index}`).join("\n");
  const summary = summarizePlatformLogText(longText);
  assert.match(summary, /已折叠/);
  assert.match(summary, /line-0/);
  assert.match(summary, /line-39/);
});

test("studio platform log copy handles missing clipboard without clearing logs", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  const copySource = extractScriptFunction(script, "copyPlatformLogs");

  assert.match(copySource, /navigator\.clipboard\?\.writeText\?\.call\(navigator\.clipboard,\s*text\)\.catch\(\(\) => \{\}\)/);
  assert.doesNotMatch(copySource, /platformLogs = \[\]/);
  assert.doesNotMatch(copySource, /platformLogOutput\.textContent = ""/);
});

test("studio platform logs ignore stale refresh responses and explain app source limits", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  const loadSource = extractScriptFunction(script, "loadPlatformLogs");

  assert.match(html, /let platformLogLoadSequence = 0/);
  assert.match(loadSource, /const requestId = \+\+platformLogLoadSequence/);
  assert.match(loadSource, /if \(requestId !== platformLogLoadSequence\) \{\s*return platformLogs;/s);
  assert.match(loadSource, /finally \{\s*if \(requestId === platformLogLoadSequence\) \{/s);
  assert.match(html, /App 来源当前展示桌面启动状态和日志路径/);
  assert.match(loadSource, /platformLogEntriesFromText\("app", "desktop-status"/);
});

test("studio controls use consistent desktop sizing and header alignment", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /--control-height:\s*38px/);
  assert.match(html, /--control-radius:\s*7px/);
  assert.match(html, /--control-gap:\s*8px/);
  assert.match(html, /\.icon-button,\s*\.action-button,\s*\.primary-action,\s*\.secondary-action\s*\{[\s\S]*min-height:\s*var\(--control-height\)/);
  assert.match(html, /\.icon-button,\s*\.action-button,\s*\.primary-action,\s*\.secondary-action\s*\{[\s\S]*border-radius:\s*var\(--control-radius\)/);
  assert.match(html, /\.text-input\s*\{[\s\S]*min-height:\s*var\(--control-height\)/);
  assert.match(html, /\.input-preview\s*\{[\s\S]*min-height:\s*var\(--control-height\)/);
  assert.match(html, /\.checkbox-field\s*\{[\s\S]*min-height:\s*var\(--control-height\)/);
  assert.match(html, /\.panel-head,\s*\.table-head\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[\s\S]*align-items:\s*start/);
  assert.match(html, /\.panel-actions\s*\{[\s\S]*align-items:\s*center;[\s\S]*gap:\s*var\(--control-gap\)/);
  assert.match(html, /\.topbar-actions\s*\{[\s\S]*align-items:\s*center;[\s\S]*flex-wrap:\s*wrap;[\s\S]*gap:\s*var\(--control-gap\)/);
});

test("studio guide hero avoids cramped mode cards and oversized empty space", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /\.page-hero\s*\{[\s\S]*grid-template-columns:\s*minmax\(360px,\s*1fr\) minmax\(300px,\s*0\.72fr\)/);
  assert.match(html, /\.page\[data-panel="guide"\] \.mode-grid\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(html, /\.page\[data-panel="guide"\] \.mode-card\s*\{[\s\S]*min-height:\s*104px/);
  assert.match(html, /\.page\[data-panel="guide"\] \.hero-copy \.panel-actions\s*\{[\s\S]*justify-content:\s*flex-start/);
  assert.doesNotMatch(html, /\.page\[data-panel="guide"\] \.mode-card\s*\{[^}]*min-height:\s*180px/);
});

test("studio bot layout does not stretch the empty bot list beside the bridge panel", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /\.bot-workspace-layout\s*\{[\s\S]*align-items:\s*start/);
  assert.match(html, /\.bot-profile-list\s*\{[\s\S]*min-height:\s*76px;[\s\S]*max-height:\s*320px;[\s\S]*overflow:\s*auto/);
  assert.match(html, /\.bot-profile-list:empty::before\s*\{[\s\S]*content:\s*"还没有 Bot 档案，点上方新增 Bot 开始。"/);
  assert.match(html, /\.page\[data-panel="bot"\] \.page-hero\s*\{[\s\S]*grid-template-columns:\s*minmax\(360px,\s*1fr\) minmax\(0,\s*0\.92fr\)/);
  assert.match(html, /\.page\[data-panel="bot"\] \.page-hero\s*\{[\s\S]*align-items:\s*start/);
  assert.match(html, /\.page\[data-panel="bot"\] \.text-area\s*\{[\s\S]*min-height:\s*120px/);
});

test("studio bridge controls are grouped into balanced action rows", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /class="panel-actions bridge-action-grid"/);
  assert.match(html, /class="panel-actions bridge-log-actions"/);
  assert.match(html, /\.bridge-action-grid\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(116px,\s*1fr\)\)/);
  assert.match(html, /\.bridge-action-grid \.primary-action,\s*\.bridge-action-grid \.secondary-action\s*\{[\s\S]*width:\s*100%/);
  assert.match(html, /\.bridge-login-box\s*\{[\s\S]*grid-template-columns:\s*minmax\(120px,\s*132px\) minmax\(0,\s*1fr\)/);
  assert.match(html, /@media \(max-width: 780px\)[\s\S]*\.bridge-login-box[\s\S]*grid-template-columns:\s*1fr/);
});

test("studio guide hero nests deployment tracks under the setup copy and keeps mode cards beside it", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /<div class="hero-copy guide-setup-copy">[\s\S]*<div class="guide-track-grid">[\s\S]*API 轻量部署[\s\S]*本地完整部署[\s\S]*<\/div>[\s\S]*<\/div>\s*<div class="mode-grid guide-mode-grid"/);
  assert.match(html, /\.guide-setup-hero\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(240px,\s*0\.54fr\)/);
  assert.match(html, /\.guide-track-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /\.guide-mode-grid\s*\{[\s\S]*align-self:\s*stretch;[\s\S]*grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /\.guide-mode-grid \.mode-card small\s*\{[\s\S]*white-space:\s*normal;[\s\S]*overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(html, /<div class="guide-card">[\s\S]*<div class="guide-tabs">[\s\S]*<div class="mode-grid"/);
});

test("studio bot page moves persona editing left and places large actions above bot list and bridge", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /<div class="bot-command-bar"[\s\S]*data-bot-create[\s\S]*data-bot-save[\s\S]*data-bot-load[\s\S]*data-bot-delete[\s\S]*<\/div>\s*<div class="bot-workspace-layout">/);
  assert.match(html, /<div class="panel bot-profile-panel">[\s\S]*data-bot-profile-list[\s\S]*data-bot-system-input[\s\S]*<\/div>\s*<div class="panel bot-bridge-panel">/);
  assert.match(html, /\.bot-command-bar\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(124px,\s*1fr\)\)/);
  assert.match(html, /\.bot-workspace-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(360px,\s*0\.9fr\) minmax\(0,\s*1\.1fr\)/);
  assert.match(html, /\.bot-profile-panel\s*\{[\s\S]*grid-template-rows:\s*auto auto auto auto/);
});

test("studio bot bridge includes loop checks and a fuller right-side weixin session layout", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  for (const attr of [
    "data-bot-bridge-test-text",
    "data-bot-bridge-test-voice",
    "data-bot-bridge-test-emoji",
    "data-bot-bridge-session-card",
  ]) {
    assert.match(html, new RegExp(attr));
  }
  assert.match(html, /class="bridge-operational-grid"/);
  assert.match(html, /class="bridge-loop-checks"/);
  assert.match(html, /测试文字回复[\s\S]*测试语音回复[\s\S]*测试表情包回复/);
  assert.match(html, /\.bridge-operational-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(250px,\s*0\.82fr\) minmax\(0,\s*1\.18fr\)/);
  assert.match(html, /\.bridge-loop-card\s*\{[\s\S]*min-height:\s*108px/);
});

test("studio conversation metrics keep typography proportional and avoid oversized summary text", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /class="metric-grid conversation-summary-grid"/);
  assert.match(html, /\.conversation-summary-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(132px,\s*1fr\)\)/);
  assert.match(html, /\.conversation-summary-grid \.metric\s*\{[\s\S]*min-height:\s*112px/);
  assert.match(html, /\.conversation-summary-grid \.metric strong\s*\{[\s\S]*font-size:\s*clamp\(15px,\s*1\.6vw,\s*20px\)/);
  assert.match(html, /\.conversation-summary-grid \.metric strong\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
});

test("studio diagnostics hero shows full API card and chat workspace hides management navigation", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /class="diagnostic-summary-grid"/);
  assert.match(html, /\.page\[data-panel="diagnostics"\] \.page-hero\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(html, /\.diagnostic-summary-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(150px,\s*1fr\)\)/);
  assert.match(html, /\.diagnostic-summary-grid \.step-row\s*\{[\s\S]*grid-template-columns:\s*42px minmax\(0,\s*1fr\)/);
  assert.match(html, /\.studio-shell\[data-workspace="chat"\]\s*\{[\s\S]*grid-template-columns:\s*0 minmax\(0,\s*1fr\)/);
  assert.match(html, /\.studio-shell\[data-workspace="chat"\] \.studio-nav\s*\{[\s\S]*transform:\s*translateX\(-100%\)/);
  assert.match(html, /\.page\[data-panel="chat"\]\s*\{[\s\S]*max-width:\s*1120px;[\s\S]*margin:\s*0 auto/);
  assert.match(html, /\.chat-layout\s*\{[\s\S]*min-height:\s*calc\(100vh - 150px\)/);
  assert.match(html, /function activateWorkspace\(workspace\) \{[\s\S]*root\.dataset\.rail = next === "chat" \? "hidden" : root\.dataset\.rail/s);
});

test("studio secondary pages show usable empty states instead of blank canvases", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /class="feature-workbench asset-workbench"/);
  assert.match(html, /data-asset-empty[\s\S]*还没有素材/);
  assert.match(html, /素材导入流程/);
  assert.match(html, /class="feature-workbench rule-workbench"/);
  assert.match(html, /规则为空/);
  assert.match(html, /class="feature-workbench task-workbench"/);
  assert.match(html, /早安问候规则/);
  assert.match(html, /class="feature-workbench statistics-workbench"/);
  assert.match(html, /暂无统计数据/);
  assert.match(html, /\.feature-workbench\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /\.empty-state-panel\s*\{[\s\S]*min-height:\s*220px/);
});
