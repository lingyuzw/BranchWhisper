/* ============================================================
   ui-services.js — Service orchestration page (services.html)
   LoveChoice Voice Console · Precision Console
   ============================================================ */

import { state } from "./state.js";
import { $, setText, renderIcons, showToast, showSkeleton, showConfirm, createIcon, safePort } from "./utils.js";
import { loadConfig, loadServices, startService, stopService, startAllServices, stopAllServices, fetchServiceLogs, clearServiceLogs, clearAllServiceLogs } from "./api.js";

/* ---- init ---- */

let eventsBound = false;
let servicesMounted = false;

export function initServices() {
  setupServiceEvents();
  syncLogFromHash();

  showSkeleton("serviceCards", 3);
  loadConfig().then(() => {
    loadServices().then(() => {
      renderServiceCards();
      renderLogTabs();
      if (servicesMounted) startServicePolling();
      refreshLogs(state.selectedLogService, { quiet: true });
      setText("topStatus", serviceSummaryText());
    });
  });
}

export function enterServices() {
  servicesMounted = true;
  syncLogFromHash();
  startServicePolling();
}

export function leaveServices() {
  servicesMounted = false;
  stopServicePolling();
}

function setupServiceEvents() {
  if (eventsBound) return;
  eventsBound = true;
  $("#startAllBtn")?.addEventListener("click", handleStartAll);
  $("#stopAllBtn")?.addEventListener("click", handleStopAll);
  $("#restartAllBtn")?.addEventListener("click", handleRestartAll);
  $("#clearAllLogsBtn")?.addEventListener("click", handleClearAllLogs);
  $("#healthBtn")?.addEventListener("click", () => loadServices().then(() => renderServiceCards()));
  $("#refreshLogsBtn")?.addEventListener("click", () => refreshLogs(state.selectedLogService));
  $("#copyLogBtn")?.addEventListener("click", copyCurrentLog);
  $("#downloadLogBtn")?.addEventListener("click", downloadCurrentLog);
}

function syncLogFromHash() {
  const hash = location.hash.replace(/^#/, "");
  if (hash.startsWith("logs-")) {
    state.selectedLogService = hash.slice(5) || state.selectedLogService;
  }
}

function serviceSummaryText() {
  const running = state.services.filter((s) => s.running).length;
  return `${running}/${state.services.length} 运行`;
}

/* ---- cards (slim: status dot + name + 3 buttons) ---- */

function renderServiceCards() {
  const host = $("#serviceCards");
  if (!host) return;
  host.innerHTML = "";
  for (const service of state.services) host.appendChild(createServiceCard(service));
  renderIcons();
}

function createServiceCard(service) {
  const card = document.createElement("article");
  const healthOk = service.health?.ok;
  const stateClass = service.running ? "active" : healthOk === false ? "failed" : "";
  card.className = `service-card ${stateClass}`;
  card.dataset.serviceCard = service.id;

  const stateLabel = service.external ? "External" : service.running ? "Running" : healthOk === false ? "Failed" : "Stopped";
  const health = service.health ? (service.health.ok ? "OK" : "Fail") : "--";
  const pid = service.external ? "external" : service.pid || "--";
  const port = safePort(service.health_url);

  const head = document.createElement("div");
  head.className = "service-head";
  const dot = document.createElement("span");
  dot.className = "status-dot";
  const title = document.createElement("div");
  title.className = "service-title";
  const name = document.createElement("strong");
  name.textContent = service.label || service.id;
  const desc = document.createElement("small");
  desc.textContent = service.description || "";
  title.append(name, document.createElement("br"), desc);
  const badge = document.createElement("span");
  badge.className = `service-badge ${service.running ? "running" : healthOk === false ? "failed" : ""}`;
  badge.textContent = stateLabel;
  head.append(dot, title, badge);

  const meta = document.createElement("div");
  meta.className = "service-meta";
  for (const [label, value] of [["HEALTH", health], ["PID", pid], ["PORT", port]]) {
    const cell = document.createElement("div");
    cell.className = "meta-cell";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    cell.append(span, strong);
    meta.appendChild(cell);
  }

  const actions = document.createElement("div");
  actions.className = "service-actions";
  const startBtn = serviceActionButton("start", "play", "启动");
  const stopBtn = serviceActionButton("stop", "square", "停止");
  const restartBtn = serviceActionButton("restart", "refresh-ccw", "重启");
  actions.append(startBtn, stopBtn, restartBtn);
  card.append(head, meta, actions);
  card.querySelector(".start").addEventListener("click", () => handleStart(service.id));
  card.querySelector(".stop").addEventListener("click", () => handleStop(service.id));
  card.querySelector(".restart").addEventListener("click", () => handleRestart(service.id));
  return card;
}

function serviceActionButton(className, icon, label) {
  const button = document.createElement("button");
  button.className = `service-action ${className}`;
  button.type = "button";
  button.append(createIcon(icon), document.createTextNode(label));
  return button;
}

/* ---- actions ---- */

async function handleStart(id) { setBusy(id, "启动中..."); if (state.previewMode) return showToast("预览模式", "info"); try { await startService(id); await loadServices(); renderServiceCards(); } catch (e) { showToast(`失败：${e.message}`, "error"); setBusy(id, ""); } }
async function handleStop(id)  { setBusy(id, "停止中..."); if (state.previewMode) return showToast("预览模式", "info"); try { await stopService(id); await loadServices(); renderServiceCards(); } catch (e) { showToast(`失败：${e.message}`, "error"); setBusy(id, ""); } }
async function handleRestart(id) { setBusy(id, "重启中..."); if (state.previewMode) return showToast("预览模式", "info"); try { await stopService(id); await startService(id); await loadServices(); renderServiceCards(); } catch (e) { showToast(`失败：${e.message}`, "error"); setBusy(id, ""); } }

function setBusy(id, label) {
  const card = document.querySelector(`[data-service-card="${id}"]`);
  if (!card) return;
  card.querySelectorAll("button").forEach((b) => { b.disabled = Boolean(label); });
}

async function handleStartAll() {
  if (state.previewMode) return showToast("预览模式", "info");
  showLog("启动 ASR...\nASR OK\n启动 LLM...\nLLM OK\n启动 TTS...");
  try { await startAllServices(); await loadServices(); renderServiceCards(); showLog("启动流程已提交。"); }
  catch (e) { showToast(`失败：${e.message}`, "error"); }
}

async function handleStopAll() {
  if (state.previewMode) return showToast("预览模式", "info");
  showLog("stopping all services...");
  try { await stopAllServices(); await loadServices(); renderServiceCards(); }
  catch (e) { showToast(`失败：${e.message}`, "error"); }
}

async function handleRestartAll() {
  if (state.previewMode) return showToast("预览模式", "info");
  showLog("停止全部...\n重新启动...");
  try { await stopAllServices(); await startAllServices(); await loadServices(); renderServiceCards(); }
  catch (e) { showToast(`失败：${e.message}`, "error"); }
}

async function handleClearAllLogs() {
  if (state.previewMode) return;
  if (!(await showConfirm("清空所有日志？"))) return;
  try { await clearAllServiceLogs(); await refreshLogs(state.selectedLogService, { quiet: true }); }
  catch (e) { showToast(`失败：${e.message}`, "error"); }
}

/* ---- logs ---- */

export async function refreshLogs(serviceId, options = {}) {
  state.selectedLogService = serviceId || state.selectedLogService || "asr";
  renderLogTabs();
  if (state.previewMode) { if (!options.quiet) showLog("预览模式没有真实日志。"); return; }
  try { showLog(await fetchServiceLogs(state.selectedLogService) || "暂无日志。"); }
  catch (e) { if (!options.quiet) showLog(`读取失败：${e.message}`); }
}

function showLog(text) {
  const output = $("#logOutput"); if (!output) return;
  output.textContent = text || ""; output.scrollTop = output.scrollHeight;
}

function renderLogTabs() {
  const host = $("#logTabs"); if (!host) return;
  host.innerHTML = "";
  for (const s of state.services) {
    const btn = document.createElement("button"); btn.type = "button";
    btn.className = `log-tab ${s.id === state.selectedLogService ? "active" : ""}`;
    btn.textContent = s.id.toUpperCase();
    btn.addEventListener("click", () => refreshLogs(s.id));
    host.appendChild(btn);
  }
}

async function copyCurrentLog() {
  const text = $("#logOutput")?.textContent || ""; if (!text.trim()) return;
  try { await navigator.clipboard.writeText(text); showToast("已复制", "success"); } catch { showToast("复制失败", "error"); }
}

function downloadCurrentLog() {
  const text = $("#logOutput")?.textContent || ""; if (!text.trim()) return;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `lovechoice-${state.selectedLogService || "service"}.log`;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 200);
}

function startServicePolling() {
  window.clearInterval(state.servicePollTimer);
  state.servicePollTimer = window.setInterval(async () => {
    if (!servicesMounted) return;
    await loadServices(); renderServiceCards(); setText("topStatus", serviceSummaryText());
  }, 4500);
}

function stopServicePolling() {
  window.clearInterval(state.servicePollTimer);
  state.servicePollTimer = 0;
}

window.addEventListener("beforeunload", stopServicePolling);
