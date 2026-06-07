/* ============================================================
   ui-dashboard.js — Chat dashboard (index.html)
   LoveChoice Voice Console · Precision Console
   ============================================================ */

import { state, ACTIVE_CONVERSATION_KEY } from "./state.js";
import { $, setText, renderIcons, formatConversationMeta, showToast, showSkeleton } from "./utils.js";
import { loadConfig, loadServices, loadConversations, createConversation, deleteConversation, loadMemory, addMemory, deleteMemory } from "./api.js";
import { connectSocket, reconnectDialog, clearTranscript, selectConversation, sendText, resizeComposerInput, interruptAssistant, setTranscriptCallback, setPipelineUpdater } from "./dialog.js";
import { ensureAudioContext, startMic, stopMic, sendMicSamples, shouldTriggerBargeIn } from "./audio.js";

/* ---- init ---- */

export async function initDashboard() {
  setupDashboardEvents();
  showSkeleton("conversationList", 6);

  await loadConfig();
  await loadServices();

  await loadConversations();
  if (!state.activeConversationId && state.conversations.length) {
    state.activeConversationId = state.conversations[0].id;
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, state.activeConversationId);
  }
  renderConversationList();
  resetPipelineCompact();
  setPipelineUpdater((stage, label) => updatePipelineCompact(stage, label));
  setTranscriptCallback(() => renderConversationList());
  connectSocket();
  drawScope();
  setText("dialogState", "待机");
  setupMemoryModal();
}

function setupDashboardEvents() {
  $("#micBtn")?.addEventListener("click", toggleMic);
  $("#sendBtn")?.addEventListener("click", sendText);
  $("#resetBtn")?.addEventListener("click", newConversation);
  $("#newConversationBtn")?.addEventListener("click", newConversation);
  $("#interruptBtn")?.addEventListener("click", () => interruptAssistant("manual"));
  const textInput = $("#textInput");
  textInput?.addEventListener("input", () => resizeComposerInput(textInput));
  textInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendText(); }
  });
  resizeComposerInput(textInput);
}

/* ---- pipeline compact (sidebar) ---- */

function resetPipelineCompact() {
  const rows = document.querySelectorAll("#pipelineCompact .pipeline-row");
  rows.forEach((r) => { r.classList.remove("active", "done"); r.querySelector("small").textContent = "--"; });
}

function updatePipelineCompact(stage, label) {
  const steps = ["vad", "asr", "llm", "tts"];
  const index = steps.indexOf(stage);
  const rows = document.querySelectorAll("#pipelineCompact .pipeline-row");
  rows.forEach((r, i) => {
    r.classList.remove("active", "done");
    if (index >= 0 && i < index) r.classList.add("done");
    else if (i === index) r.classList.add("active");
  });
  if (stage === "idle") {
    rows.forEach((r) => { r.classList.remove("active", "done"); r.querySelector("small").textContent = "--"; });
  }
  if (label && index >= 0) {
    const row = rows[index];
    if (row) row.querySelector("small").textContent = label;
  }
}

/* ---- conversation list ---- */

function renderConversationList() {
  const host = $("#conversationList");
  if (!host) return;
  host.innerHTML = "";
  const conversations = state.conversations.slice(0, 24);
  if (!conversations.length) {
    const p = document.createElement("p"); p.className = "conversation-empty"; p.textContent = "还没有保存的对话"; host.appendChild(p); return;
  }
  for (const c of conversations) {
    const item = document.createElement("div");
    item.className = `conversation-item ${c.id === state.activeConversationId ? "active" : ""}`;
    const openBtn = document.createElement("button");
    openBtn.type = "button"; openBtn.className = "conversation-open";
    openBtn.innerHTML = "<strong></strong><span></span><small></small>";
    openBtn.querySelector("strong").textContent = c.title || "新的对话";
    openBtn.querySelector("span").textContent = c.last_message || "空会话";
    openBtn.querySelector("small").textContent = formatConversationMeta(c);
    openBtn.addEventListener("click", () => selectConversation(c.id));
    const delBtn = document.createElement("button");
    delBtn.type = "button"; delBtn.className = "conversation-delete"; delBtn.title = "删除";
    delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
    delBtn.addEventListener("click", () => handleDeleteConversation(c));
    item.append(openBtn, delBtn);
    host.appendChild(item);
  }
  renderIcons();
}

async function newConversation() {
  if (state.previewMode) { clearTranscript(); showToast("预览模式：已清空对话区", "info"); return; }
  try {
    const c = await createConversation();
    state.activeConversationId = c.id;
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, c.id);
    await loadConversations(); renderConversationList(); reconnectDialog();
  } catch (e) { showToast(`新建失败：${e.message}`, "error"); }
}

async function handleDeleteConversation(conversation) {
  if (!conversation?.id || state.previewMode) return;
  if (!window.confirm(`删除「${conversation.title || "这次对话"}」？`)) return;
  const wasActive = conversation.id === state.activeConversationId;
  try {
    await deleteConversation(conversation.id);
    if (wasActive) { state.activeConversationId = ""; state.activeConversation = null; localStorage.removeItem(ACTIVE_CONVERSATION_KEY); clearTranscript(); }
    await loadConversations(); renderConversationList();
    if (wasActive) reconnectDialog();
  } catch (e) { showToast(`删除失败：${e.message}`, "error"); }
}

/* ---- microphone toggle ---- */

async function toggleMic() {
  if (state.micActive) {
    stopMic(); setText("dialogState", "待机"); updatePipelineCompact("idle");
  } else {
    if (!state.connected) { showToast("对话通道未连接", "error"); return; }
    await startMic({ onSendSamples: (samples) => {
      if (state.busy && state.assistantActive && shouldTriggerBargeIn()) interruptAssistant("voice");
      if (state.busy) return;
      sendMicSamples(samples);
    }});
    setText("dialogState", "监听中"); updatePipelineCompact("vad", "listening");
  }
}

/* ---- waveform ---- */

function drawScope() {
  const canvas = $("#scopeCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 800;
  const height = canvas.clientHeight || 160;
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.025)"; ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

  state.levels.push(state.latestLevel); state.levels.shift();
  ctx.beginPath();
  state.levels.forEach((level, i) => {
    const x = (i / (state.levels.length - 1)) * width;
    const y = height / 2 - level * height * 0.38;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  const lineColor = state.busy ? "#d29922" : state.micActive ? "#d4a853" : "#58a6ff";
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.shadowColor = lineColor; ctx.shadowBlur = 8; ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2);
  ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1; ctx.stroke();

  requestAnimationFrame(drawScope);
}

/* ---- memory modal ---- */

function setupMemoryModal() {
  $("#memoryTriggerBtn")?.addEventListener("click", openMemoryModal);
  document.querySelector("#memoryModal .modal-close")?.addEventListener("click", closeMemoryModal);
  $("#memoryModal")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeMemoryModal(); });
  $("#memoryAddBtn")?.addEventListener("click", handleMemoryAdd);
  $("#memoryAddInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleMemoryAdd(); });
}

async function openMemoryModal() {
  $("#memoryModal").hidden = false;
  await loadMemory(); renderMemoryModalList();
}

function closeMemoryModal() { $("#memoryModal").hidden = true; }

function renderMemoryModalList() {
  const host = $("#memoryModalList");
  if (!host) return;
  host.innerHTML = "";
  if (!state.memories.length) { host.innerHTML = '<p class="conversation-empty">暂无记忆。聊天中 AI 会自动提取并保存。</p>'; return; }
  for (const item of state.memories) {
    const div = document.createElement("div"); div.className = "memory-item";
    div.innerHTML = `<div><strong>${item.key || "--"}</strong><br><span>${item.value || ""}</span><br><small>${item.layer} · ${item.count || 0} 次</small></div>`;
    const delBtn = document.createElement("button"); delBtn.type = "button"; delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
    delBtn.addEventListener("click", () => handleMemoryDelete(item.id));
    div.appendChild(delBtn); host.appendChild(div);
  }
  renderIcons();
}

async function handleMemoryAdd() {
  const input = $("#memoryAddInput"); const val = input?.value.trim(); if (!val) return;
  try { await addMemory(val); input.value = ""; await loadMemory(); renderMemoryModalList(); showToast("已添加", "success"); }
  catch (e) { showToast(`添加失败：${e.message}`, "error"); }
}

async function handleMemoryDelete(id) {
  if (!window.confirm("删除这条记忆？")) return;
  try { await deleteMemory(id); await loadMemory(); renderMemoryModalList(); showToast("已删除", "success"); }
  catch (e) { showToast(`删除失败：${e.message}`, "error"); }
}
