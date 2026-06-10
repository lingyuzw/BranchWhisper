/* ============================================================
   ui-integrations.js — OpenClaw / channel bot management
   BranchWhisper
   ============================================================ */

import { state } from "../stores/state.js";
import {
  createIntegration,
  clearIntegrationLogs,
  deleteIntegration,
  fetchIntegrationLogs,
  installIntegration,
  loadIntegrations,
  pollIntegrationQrLogin,
  restartIntegration,
  startIntegration,
  startIntegrationBridge,
  startIntegrationQrLogin,
  stopIntegration,
  testIntegrationDialog,
  testIntegrationVoice,
  updateIntegration,
} from "../api/index.js";
import { $, createIcon, renderIcons, setText, showConfirm, showSkeleton, showToast } from "../utils/dom.js";

const DEFAULT_KEYWORDS = ["发语音", "发条语音", "发句语音", "说句话", "讲句话", "念给我听", "读出来", "语音回复", "我想听你说话", "听听"];

let eventsBound = false;
let integrationsMounted = false;
let editingIntegrationId = "";
let logScope = "current";

export function initIntegrations() {
  setupIntegrationEvents();
  showSkeleton("integrationCards", 2);
  showSkeleton("integrationEnvGrid", 5);
  refreshIntegrations({ quiet: true });
}

export function enterIntegrations() {
  integrationsMounted = true;
  refreshIntegrations({ quiet: true });
  startPolling();
}

export function leaveIntegrations() {
  integrationsMounted = false;
  stopPolling();
  stopLoginPolling();
}

function setupIntegrationEvents() {
  if (eventsBound) return;
  eventsBound = true;
  $("#addIntegrationBtn")?.addEventListener("click", () => openAddIntegrationModal());
  $("#refreshIntegrationsBtn")?.addEventListener("click", () => refreshIntegrations());
  $("#integrationLoginBtn")?.addEventListener("click", () => beginQrLogin());
  $("#integrationInstallBtn")?.addEventListener("click", () => runSelectedAction("install"));
  $("#refreshIntegrationLogsBtn")?.addEventListener("click", () => refreshSelectedLogs());
  $("#integrationClearLogsBtn")?.addEventListener("click", clearSelectedLogs);
  $("#integrationLogScope")?.addEventListener("change", (event) => {
    logScope = event.target.value || "current";
    refreshSelectedLogs();
  });
  $("#integrationTestBtn")?.addEventListener("click", runDialogProbe);
  $("#integrationTestInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runDialogProbe();
    }
  });
  $("#integrationVoiceTestBtn")?.addEventListener("click", runVoiceProbe);
  $("#integrationVoiceTestInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runVoiceProbe();
    }
  });
  $("#integrationForm")?.addEventListener("submit", saveIntegrationForm);
  $("#integrationCancelBtn")?.addEventListener("click", closeIntegrationModal);
  document.querySelector("#integrationModal .modal-close")?.addEventListener("click", closeIntegrationModal);
  $("#integrationModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeIntegrationModal();
  });
}

async function refreshIntegrations(options = {}) {
  const result = await loadIntegrations();
  renderEnvironment();
  renderIntegrationCards();
  await refreshSelectedLogs({ quiet: true });
  setText("topStatus", integrationSummaryText());
  if (!result.ok && !options.quiet) showToast("接入状态读取失败", "error");
}

function integrationSummaryText() {
  const active = state.integrations.filter((item) => ["running", "login"].includes(item.status)).length;
  return `${active}/${state.integrations.length} 接入`;
}

function startPolling() {
  stopPolling();
  state.integrationPollTimer = window.setInterval(() => {
    if (!integrationsMounted) return;
    refreshIntegrations({ quiet: true });
  }, 6000);
}

function stopPolling() {
  if (state.integrationPollTimer) {
    window.clearInterval(state.integrationPollTimer);
    state.integrationPollTimer = 0;
  }
}

function startLoginPolling() {
  stopLoginPolling();
  state.integrationLoginPollTimer = window.setInterval(async () => {
    if (!integrationsMounted || !state.integrationLoginSession?.integrationId) return;
    await pollQrLogin({ quiet: true });
  }, 2600);
}

function stopLoginPolling() {
  if (state.integrationLoginPollTimer) {
    window.clearInterval(state.integrationLoginPollTimer);
    state.integrationLoginPollTimer = 0;
  }
}

function renderEnvironment() {
  const host = $("#integrationEnvGrid");
  if (!host) return;
  host.innerHTML = "";
  const env = state.integrationEnv;
  setText("integrationEnvBadge", env?.ready ? "环境可用" : "需要配置");
  const tools = env?.tools || {};
  for (const name of ["node", "npm", "openclaw", "ffmpeg", "silk-wasm"]) {
    host.appendChild(createEnvCard(name, tools[name]));
  }
  renderIcons();
}

function createEnvCard(name, tool) {
  const card = document.createElement("article");
  card.className = `integration-env-card ${tool?.available ? "ready" : "missing"}`;
  const icon = document.createElement("span");
  icon.className = "integration-env-icon";
  icon.append(createIcon(tool?.available ? "check" : "circle-alert"));
  const title = document.createElement("strong");
  title.textContent = name;
  const version = document.createElement("small");
  version.textContent = tool?.version || "未检测到";
  const path = document.createElement("span");
  path.textContent = tool?.path || "PATH 中不可用";
  card.append(icon, title, version, path);
  return card;
}

function renderIntegrationCards() {
  const host = $("#integrationCards");
  if (!host) return;
  host.innerHTML = "";
  if (!state.integrations.length) {
    const empty = document.createElement("div");
    empty.className = "integration-empty";
    empty.textContent = "还没有接入实例。";
    host.appendChild(empty);
    renderIcons();
    return;
  }
  for (const integration of state.integrations) {
    host.appendChild(createIntegrationCard(integration));
  }
  if (!state.integrations.some((item) => item.id === state.selectedIntegrationId)) {
    state.selectedIntegrationId = state.integrations[0]?.id || "";
  }
  renderSelectedPanel();
  renderIcons();
}

function createIntegrationCard(integration) {
  const card = document.createElement("article");
  const active = integration.id === state.selectedIntegrationId;
  card.className = `integration-card ${statusClass(integration.status)}${active ? " selected" : ""}`;
  card.dataset.integrationId = integration.id;
  card.addEventListener("click", () => selectIntegration(integration.id));

  const head = document.createElement("div");
  head.className = "integration-card-head";
  const title = document.createElement("div");
  title.className = "integration-title";
  const dot = document.createElement("span");
  dot.className = "status-dot";
  const name = document.createElement("strong");
  name.textContent = integration.chat_name || integration.id;
  const desc = document.createElement("small");
  desc.textContent = `微信个人号 · ${integration.id} · OpenClaw ${integration.openclaw_profile || "branchwhisper"}`;
  title.append(dot, name, document.createElement("br"), desc);
  const badge = document.createElement("span");
  badge.className = `service-badge ${statusClass(integration.status)}`;
  badge.textContent = statusText(integration.status);
  head.append(title, badge);

  const meta = document.createElement("div");
  meta.className = "integration-meta";
  const lastError = integration.last_error || integration.runtime?.last_error || "--";
  for (const [label, value] of [
    ["配置", integration.enabled ? "自动启用" : "手动模式"],
    ["回复", integration.reply_mode || "text"],
    ["账号", integration.runtime?.account_count ?? 0],
    ["PID", integration.pid || "--"],
    ["守护", integration.runtime?.manual_stop ? "手动停止" : "自动恢复"],
    ["提示", humanError(lastError)],
  ]) {
    meta.appendChild(metaCell(label, value));
  }

  const note = document.createElement("div");
  note.className = `integration-state-note ${statusClass(integration.status)}`;
  note.append(createIcon(statusIcon(integration.status)), document.createTextNode(integrationHint(integration)));

  const actions = document.createElement("div");
  actions.className = "integration-actions";
  actions.append(
    actionButton("启动桥接", "play", () => handleCardAction(integration.id, "start")),
    actionButton("停止", "square", () => handleCardAction(integration.id, "stop")),
    actionButton("重启", "refresh-ccw", () => handleCardAction(integration.id, "restart")),
    actionButton("编辑", "settings-2", () => openIntegrationModal(integration)),
    actionButton("删除", "trash-2", () => handleDelete(integration.id)),
  );

  card.append(head, meta, note, actions);
  return card;
}

function metaCell(label, value) {
  const cell = document.createElement("div");
  cell.className = "meta-cell";
  const span = document.createElement("span");
  span.textContent = label;
  const strong = document.createElement("strong");
  strong.title = String(value || "");
  strong.textContent = compact(String(value || "--"), 34);
  cell.append(span, strong);
  return cell;
}

function actionButton(label, icon, handler) {
  const button = document.createElement("button");
  button.className = "service-action";
  button.type = "button";
  button.append(createIcon(icon), document.createTextNode(label));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    handler();
  });
  return button;
}

async function handleCardAction(id, action) {
  state.selectedIntegrationId = id;
  try {
    if (action === "start") await ensureIntegrationEnabled(id);
    if (action === "restart") await ensureIntegrationEnabled(id);
    if (action === "start") await startIntegration(id);
    if (action === "stop") await stopIntegration(id);
    if (action === "restart") await restartIntegration(id);
    if (action === "bridge") await startIntegrationBridge(id);
    await refreshIntegrations({ quiet: true });
    showToast(action === "start" || action === "bridge" ? "桥接进程已启动" : "操作已发送", "success");
  } catch (error) {
    showToast(`操作失败：${error.message}`, "error");
  }
}

async function ensureIntegrationEnabled(id) {
  const item = state.integrations.find((integration) => integration.id === id);
  if (!item || item.enabled) return;
  await updateIntegration(id, { enabled: true });
}

async function handleDelete(id) {
  const ok = await showConfirm(`删除接入实例 ${id}？`);
  if (!ok) return;
  try {
    await deleteIntegration(id);
    state.selectedIntegrationId = state.integrations[0]?.id || "";
    await refreshIntegrations({ quiet: true });
    showToast("实例已删除", "success");
  } catch (error) {
    showToast(`删除失败：${error.message}`, "error");
  }
}

function selectIntegration(id) {
  state.selectedIntegrationId = id;
  renderIntegrationCards();
  refreshSelectedLogs({ quiet: true });
}

function renderSelectedPanel() {
  const selected = selectedIntegration();
  setText("selectedIntegrationBadge", selected?.id || "--");
  renderLoginBox(selected);
  renderAccountList(selected);
  renderTimingSummary(selected);
}

function renderLoginBox(selected) {
  const box = $("#integrationLoginBox");
  if (!box) return;
  box.innerHTML = "";
  if (!selected) {
    box.textContent = "请选择一个接入实例。";
    return;
  }
  const isReady = selected.status === "logged_in" || selected.status === "running";
  const session = isReady ? null : (state.integrationLoginSession?.integrationId === selected.id ? state.integrationLoginSession : null);
  if (selected.runtime?.manual_stop) {
    const text = document.createElement("div");
    text.className = "integration-login-placeholder";
    text.innerHTML = `<strong>已手动停止</strong><span>后台守护不会自动重启这个实例。需要继续接收微信消息时，点击左侧卡片里的“启动桥接”。</span>`;
    box.appendChild(text);
    return;
  }
  if (isReady) {
    if (state.integrationLoginSession?.integrationId === selected.id) state.integrationLoginSession = null;
    const text = document.createElement("div");
    text.className = "integration-login-placeholder";
    text.innerHTML = `<strong>${escapeHtml(statusText(selected.status))}</strong><span>${selected.status === "running" ? "桥接进程正在运行，可直接从微信发送消息测试。" : "账号已登录。需要收发消息时点击“启动桥接”。"}</span>`;
    box.appendChild(text);
    return;
  }
  if (!session) {
    const text = document.createElement("div");
    text.className = "integration-login-placeholder";
    text.innerHTML = `<strong>${escapeHtml(selected.id)}</strong><span>点击“扫码登录”后在这里显示二维码；登录凭证保存在本机 OpenClaw profile 中。</span>`;
    box.appendChild(text);
    return;
  }
  if (["created", "binded_redirect"].includes(session.status)) {
    const text = document.createElement("div");
    text.className = "integration-login-placeholder";
    text.innerHTML = `<strong>登录成功</strong><span>${escapeHtml(session.message || "账号已保存，二维码已隐藏。")}</span>`;
    box.appendChild(text);
    return;
  }
  if (session.qrcode_img_content) {
    const image = document.createElement("img");
    image.className = "integration-qr-image";
    image.alt = "微信扫码登录二维码";
    image.src = session.qrcode_img_content.startsWith("data:")
      ? session.qrcode_img_content
      : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(session.qrcode_img_content)}`;
    box.appendChild(image);
  }
  const meta = document.createElement("div");
  meta.className = "integration-login-meta";
  const title = document.createElement("strong");
  title.textContent = loginStatusText(session.status);
  const message = document.createElement("span");
  message.textContent = session.message || "等待微信扫码。";
  const expire = document.createElement("small");
  expire.textContent = session.expires_at ? `有效期至 ${new Date(session.expires_at * 1000).toLocaleTimeString()}` : "";
  meta.append(title, message, expire);
  box.appendChild(meta);
}

function renderTimingSummary(selected) {
  const host = $("#integrationTimingSummary");
  if (!host) return;
  host.innerHTML = "";
  const items = selected?.recent_timings || [];
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "integration-empty compact";
    empty.textContent = "暂无消息耗时。";
    host.appendChild(empty);
    return;
  }
  const avg = (field) => Math.round(items.reduce((sum, item) => sum + Number(item[field] || 0), 0) / items.length);
  const summary = document.createElement("div");
  summary.className = "integration-timing-summary";
  summary.innerHTML = `
    <span><b>${items.length}</b><small>条记录</small></span>
    <span><b>${avg("bridge_ms") || avg("total_ms")}ms</b><small>平均总耗时</small></span>
    <span><b>${avg("llm_ms")}ms</b><small>平均 LLM</small></span>
    <span><b>${avg("send_ms")}ms</b><small>平均发送</small></span>
    <span><b>${voiceStatusLabel(items)}</b><small>最近语音</small></span>
  `;
  host.appendChild(summary);
}

function voiceStatusLabel(items) {
  const latest = (items || []).find((item) => item.voice_send_status);
  if (!latest) return "--";
  if (latest.voice_send_status === "accepted") return "接口已接受";
  if (latest.voice_send_status === "sent") return "已发送";
  return "失败";
}

function renderAccountList(selected) {
  const host = $("#integrationAccountList");
  if (!host) return;
  host.innerHTML = "";
  if (!selected) return;
  const stateDir = document.createElement("div");
  stateDir.className = "integration-account-item";
  stateDir.innerHTML = `<span>STATE</span><strong>${escapeHtml(selected.runtime?.state_dir || "--")}</strong>`;
  host.appendChild(stateDir);
  const mySession = selected.my_weixin_session || {};
  const my = document.createElement("div");
  my.className = `integration-account-item ${mySession.bound ? "" : "muted"}`;
  const reachable = mySession.reachable ? `可主动触达 · ${formatReachable(mySession.reachable_remaining_sec)}` : "等待你从微信发消息绑定";
  my.innerHTML = `<span>${escapeHtml(selected.chat_name || "我的微信聊天")}</span><strong>${escapeHtml(mySession.bound ? reachable : "未绑定")}</strong><small>${escapeHtml(mySession.sender_id || "请先在微信里给 BranchWhisper 发一条消息")}</small>`;
  host.appendChild(my);
  const accounts = Array.isArray(selected.accounts) ? selected.accounts : [];
  if (!accounts.length) {
    const empty = document.createElement("div");
    empty.className = "integration-account-item muted";
    empty.innerHTML = "<span>ACCOUNT</span><strong>未发现已登录账号</strong>";
    host.appendChild(empty);
    return;
  }
  for (const account of accounts) {
    const item = document.createElement("div");
    item.className = "integration-account-item";
    item.innerHTML = `<span>ACCOUNT</span><strong>${escapeHtml(account.id || "--")}</strong><small>${escapeHtml(account.user_id || account.saved_at || "")}</small>`;
    host.appendChild(item);
  }
}

async function runSelectedAction(action) {
  const selected = selectedIntegration();
  if (!selected) {
    showToast("请先选择实例", "error");
    return;
  }
  try {
    if (action === "install") await installIntegration(selected.id);
    await refreshIntegrations({ quiet: true });
    await refreshSelectedLogs();
    showToast("安装命令已执行", "success");
  } catch (error) {
    showToast(`操作失败：${error.message}`, "error");
  }
}

async function beginQrLogin(force = true) {
  const selected = selectedIntegration();
  if (!selected) {
    showToast("请先选择实例", "error");
    return;
  }
  try {
    const data = await startIntegrationQrLogin(selected.id, force);
    const login = data.result?.login || {};
    state.integrationLoginSession = { ...login, integrationId: selected.id };
    renderSelectedPanel();
    await refreshSelectedLogs({ quiet: true });
    if (data.result?.ok === false) {
      showToast(login.message || data.result.error || "二维码生成失败", "error");
      return;
    }
    showToast("二维码已生成，请用手机微信扫码", "success");
    startLoginPolling();
  } catch (error) {
    showToast(`扫码登录失败：${error.message}`, "error");
  }
}

async function pollQrLogin(options = {}) {
  const selected = selectedIntegration();
  if (!selected || state.integrationLoginSession?.integrationId !== selected.id) return;
  try {
    const data = await pollIntegrationQrLogin(selected.id);
    const login = data.result?.login || {};
    state.integrationLoginSession = { ...state.integrationLoginSession, ...login, integrationId: selected.id };
    renderSelectedPanel();
    if (["created", "expired", "denied", "cancel", "canceled", "verify_code_blocked", "error"].includes(state.integrationLoginSession.status)) {
      stopLoginPolling();
      await refreshIntegrations({ quiet: true });
      await refreshSelectedLogs({ quiet: true });
      if (state.integrationLoginSession.status === "created") {
        state.integrationLoginSession = null;
        showToast("微信登录成功，账号已保存", "success");
        renderSelectedPanel();
      } else if (!options.quiet) {
        showToast(state.integrationLoginSession.message || "扫码登录结束", "error");
      }
    }
  } catch (error) {
    if (!options.quiet) showToast(`登录状态读取失败：${error.message}`, "error");
  }
}

async function refreshSelectedLogs(options = {}) {
  const selected = selectedIntegration();
  const output = $("#integrationLogOutput");
  if (!selected || !output) return;
  try {
    const logs = await fetchIntegrationLogs(selected.id, logScope);
    output.textContent = logs || (logScope === "current" ? "本次启动还没有日志。切换到“全部日志”可查看历史记录。" : "暂无日志。");
    output.scrollTop = output.scrollHeight;
  } catch (error) {
    if (!options.quiet) showToast(`日志读取失败：${error.message}`, "error");
  }
}

async function clearSelectedLogs() {
  const selected = selectedIntegration();
  if (!selected) return;
  const ok = await showConfirm(`清空 ${selected.id} 的接入日志？`);
  if (!ok) return;
  try {
    await clearIntegrationLogs(selected.id);
    await refreshSelectedLogs();
    showToast("接入日志已清空", "success");
  } catch (error) {
    showToast(`清空失败：${error.message}`, "error");
  }
}

async function runDialogProbe() {
  const selected = selectedIntegration();
  const text = $("#integrationTestInput")?.value.trim();
  if (!selected || !text) {
    showToast("请选择实例并输入测试消息", "error");
    return;
  }
  const resultBox = $("#integrationTestResult");
  if (resultBox) resultBox.textContent = "请求中...";
  try {
    const result = await testIntegrationDialog(selected.id, text);
    if (resultBox) {
      resultBox.textContent = `${result.reply_text || ""}${result.send_voice ? `\n语音文件：${result.voice_file || "--"}` : ""}`;
    }
    await refreshSelectedLogs({ quiet: true });
  } catch (error) {
    if (resultBox) resultBox.textContent = `失败：${error.message}`;
    showToast(`测试失败：${error.message}`, "error");
  }
}

async function runVoiceProbe() {
  const selected = selectedIntegration();
  const text = $("#integrationVoiceTestInput")?.value.trim();
  if (!selected || !text) {
    showToast("请选择实例并输入测试语音文本", "error");
    return;
  }
  const resultBox = $("#integrationVoiceTestResult");
  if (resultBox) resultBox.textContent = "正在合成并发送...";
  try {
    const result = await testIntegrationVoice(selected.id, text);
    if (resultBox) resultBox.textContent = formatVoiceProbeResult(result);
    await refreshIntegrations({ quiet: true });
    await refreshSelectedLogs({ quiet: true });
    showToast(result.ok ? "语音自检已发送，微信端请确认能否播放" : "语音自检失败，查看结果详情", result.ok ? "success" : "error");
  } catch (error) {
    if (resultBox) resultBox.textContent = `失败：${error.message}`;
    showToast(`语音自检失败：${error.message}`, "error");
  }
}

function formatVoiceProbeResult(result) {
  const target = result.target || {};
  const diagnostic = result.voice_diagnostic || {};
  const lines = [
    `状态：${result.ok ? "接口已接受，等待微信端验证播放" : "失败"}`,
    `阶段：${result.stage || "--"}`,
    `目标：${target.account_id || "--"} → ${target.sender_id || "--"}`,
  ];
  if (result.tts_done) lines.push(`TTS：完成 · ${result.tts_ms || 0}ms`);
  if (result.voice_file) lines.push(`文件：${result.voice_file}`);
  if (result.send_done) lines.push(`发送：完成 · ${result.send_ms || 0}ms · ${result.voice_format || "--"}`);
  if (result.voice_message_id) lines.push(`消息：${result.voice_message_id}`);
  if (Object.keys(diagnostic).length) lines.push(`诊断：${JSON.stringify(diagnostic, null, 2)}`);
  if (result.client_delivery) lines.push(`客户端：${result.client_delivery === "unconfirmed" ? "未确认，请在微信端点击播放验证" : result.client_delivery}`);
  if (result.error) lines.push(`错误：${result.error}`);
  return lines.join("\n");
}

function openIntegrationModal(integration = null) {
  editingIntegrationId = integration?.id || "";
  setText("integrationModalTitle", integration ? "编辑微信个人号" : "添加微信个人号");
  const idInput = $("#integrationIdInput");
  if (idInput) {
    idInput.value = integration?.id || "weixin_personal";
    idInput.disabled = Boolean(integration);
  }
  if ($("#integrationChatNameInput")) $("#integrationChatNameInput").value = integration?.chat_name || "我的微信聊天";
  if ($("#integrationProfileInput")) $("#integrationProfileInput").value = integration?.openclaw_profile || "branchwhisper";
  if ($("#integrationBotProfileInput")) $("#integrationBotProfileInput").value = integration?.bot_profile_id || "default";
  if ($("#integrationReplyMode")) $("#integrationReplyMode").value = integration?.reply_mode || "text";
  if ($("#integrationEnabledInput")) $("#integrationEnabledInput").checked = Boolean(integration?.enabled);
  if ($("#integrationKeywordsInput")) {
    $("#integrationKeywordsInput").value = (integration?.voice_trigger_keywords || DEFAULT_KEYWORDS).join("\n");
  }
  $("#integrationModal").hidden = false;
  renderIcons();
}

function openAddIntegrationModal() {
  const existing = state.integrations.find((item) => item.id === "weixin_personal");
  if (existing) {
    state.selectedIntegrationId = existing.id;
    openIntegrationModal(existing);
    showToast("已存在微信个人号实例，已切换为编辑。", "info");
    return;
  }
  openIntegrationModal();
}

function closeIntegrationModal() {
  $("#integrationModal").hidden = true;
  editingIntegrationId = "";
}

async function saveIntegrationForm(event) {
  event.preventDefault();
  const payload = {
    id: $("#integrationIdInput")?.value.trim() || "weixin_personal",
    chat_name: $("#integrationChatNameInput")?.value.trim() || "我的微信聊天",
    enabled: Boolean($("#integrationEnabledInput")?.checked),
    openclaw_profile: $("#integrationProfileInput")?.value.trim() || "branchwhisper",
    bot_profile_id: $("#integrationBotProfileInput")?.value.trim() || "default",
    reply_mode: $("#integrationReplyMode")?.value || "text",
    voice_trigger_keywords: ($("#integrationKeywordsInput")?.value || "")
      .split(/\r?\n|[,，]/)
      .map((item) => item.trim())
      .filter(Boolean),
  };
  try {
    if (editingIntegrationId) {
      await updateIntegration(editingIntegrationId, payload);
      state.selectedIntegrationId = editingIntegrationId;
    } else {
      const existing = state.integrations.find((item) => item.id === payload.id);
      if (existing) {
        await updateIntegration(existing.id, payload);
      } else {
        await createIntegration(payload);
      }
      state.selectedIntegrationId = payload.id;
    }
    closeIntegrationModal();
    await refreshIntegrations({ quiet: true });
    showToast("接入配置已保存", "success");
  } catch (error) {
    if (error.status === 409) {
      const existing = state.integrations.find((item) => item.id === payload.id);
      if (existing) {
        await updateIntegration(existing.id, payload);
        state.selectedIntegrationId = existing.id;
        closeIntegrationModal();
        await refreshIntegrations({ quiet: true });
        showToast("实例已存在，已更新已有配置。", "success");
        return;
      }
    }
    showToast(`保存失败：${error.message}`, "error");
  }
}

function selectedIntegration() {
  return state.integrations.find((item) => item.id === state.selectedIntegrationId) || state.integrations[0] || null;
}

function statusClass(status) {
  if (["running", "login", "logged_in"].includes(status)) return "active";
  if (["starting", "installing"].includes(status)) return "loading";
  if (status === "failed") return "failed";
  return "stopped";
}

function statusText(status) {
  return {
    running: "桥接运行中",
    login: "等待扫码",
    logged_in: "已登录未启动",
    starting: "桥接启动中",
    installing: "安装中",
    failed: "失败",
    stopped: "已停止",
  }[status] || "未知";
}

function statusIcon(status) {
  return {
    running: "radio",
    login: "scan-line",
    logged_in: "check-circle-2",
    starting: "loader-2",
    installing: "package-plus",
    failed: "circle-alert",
    stopped: "circle-pause",
  }[status] || "info";
}

function integrationHint(integration) {
  const lastError = integration.last_error || integration.runtime?.last_error || "";
  if (integration.runtime?.manual_stop) {
    return "这是你手动停止的实例，后台守护不会自动拉起。";
  }
  if (integration.status === "running") {
    return "桥接进程运行中，微信消息会直接进入 BranchWhisper。";
  }
  if (integration.status === "logged_in") {
    return "账号已保存，点击“启动桥接”后开始收发消息。";
  }
  if (integration.status === "login") {
    return "正在等待微信扫码；成功后二维码会自动隐藏。";
  }
  if (integration.status === "failed") {
    if (String(lastError).includes("Connection refused") || String(lastError).includes("refused connection")) {
      return "桥接无法连到主服务，请确认 BranchWhisper 后端正在当前端口运行。";
    }
    return humanError(lastError) || "接入出现错误，查看日志能看到具体原因。";
  }
  if (integration.enabled && integration.accounts?.length) {
    return "已启用并检测到账号，后台守护会尝试自动恢复桥接。";
  }
  return "首次使用先扫码登录；容器环境不用启动 OpenClaw Gateway。";
}

function humanError(text) {
  const value = String(text || "").trim();
  if (!value || value === "--") return "--";
  if (value.includes("gateway systemd 服务不可用") || value.includes("Gateway service disabled")) {
    return "容器中不用 Gateway，点启动桥接即可";
  }
  return compact(value, 36);
}

function loginStatusText(status) {
  return {
    idle: "未开始",
    wait: "等待扫码",
    scaned: "已扫码",
    scaned_but_redirect: "切换分区",
    binded_redirect: "已绑定",
    need_verifycode: "需要验证",
    created: "登录成功",
    confirmed: "已确认",
    expired: "已过期",
    denied: "已取消",
    error: "登录失败",
  }[status] || "登录中";
}

function compact(text, limit) {
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function formatReachable(seconds) {
  const sec = Number(seconds || 0);
  if (!Number.isFinite(sec) || sec <= 0) return "已过期";
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return hours > 0 ? `剩余 ${hours}h ${minutes}m` : `剩余 ${minutes}m`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
