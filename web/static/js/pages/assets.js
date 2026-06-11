import { state } from "../stores/state.js";
import {
  approveSticker,
  bulkStickerAction,
  deleteSticker,
  loadConfig,
  loadStickers,
  reanalyzeSticker,
  saveConfig,
  testSticker,
  testStickerVision,
  updateSticker,
  uploadStickerBatch,
} from "../api/index.js";
import { $, createIcon, renderIcons, setValue, showConfirm, showToast, value } from "../utils/dom.js";

let bound = false;
let selectedStickerId = "";
const selectedIds = new Set();
let recognitionJob = null;

const STICKER_CONFIG_FIELDS = [
  ["stickers_enabled", "assetStickersEnabled", "bool"],
  ["sticker_activity", "assetStickerActivity", "string"],
  ["sticker_cooldown_sec", "assetStickerCooldownSec", "number"],
  ["sticker_daily_limit", "assetStickerDailyLimit", "number"],
  ["sticker_max_streak", "assetStickerMaxStreak", "number"],
  ["sticker_custom_probability", "assetStickerCustomProbability", "number"],
];

export async function initAssetsPage() {
  bindEvents();
  await loadConfig();
  fillAssetConfig();
  await refreshAssets();
}

export async function enterAssetsPage() {
  await refreshAssets();
}

export function leaveAssetsPage() {}

function bindEvents() {
  if (bound) return;
  bound = true;
  $("#assetStickerUploadBtn")?.addEventListener("click", () => $("#assetStickerFileInput")?.click());
  $("#assetStickerFileInput")?.addEventListener("change", uploadFiles);
  $("#assetStickerRefreshBtn")?.addEventListener("click", refreshAssets);
  $("#assetStickerVisionTestBtn")?.addEventListener("click", runVisionTest);
  $("#assetStickerConfigSaveBtn")?.addEventListener("click", saveAssetConfig);
  $("#assetStickerStatusFilter")?.addEventListener("change", refreshAssets);
  $("#assetStickerEmotionFilter")?.addEventListener("change", refreshAssets);
  $("#assetStickerSearchInput")?.addEventListener("input", () => {
    window.clearTimeout(state.assetSearchTimer);
    state.assetSearchTimer = window.setTimeout(refreshAssets, 220);
  });
  $("#assetStickerTestBtn")?.addEventListener("click", runPolicyTest);
  $("#assetSelectAllBtn")?.addEventListener("click", toggleSelectAllVisible);
  $("#assetBulkReanalyzeBtn")?.addEventListener("click", () => runBulk("reanalyze", false));
  $("#assetBulkApproveBtn")?.addEventListener("click", () => runBulk("approve", false));
  $("#assetBulkDeleteBtn")?.addEventListener("click", () => runBulk("delete", false));
  $("#assetBulkReanalyzeAllBtn")?.addEventListener("click", () => runBulk("reanalyze", true));
  $("#assetBulkApproveAllBtn")?.addEventListener("click", () => runBulk("approve", true));
  $("#assetBulkDeleteAllBtn")?.addEventListener("click", () => runBulk("delete", true));
  $("#assetBulkStopBtn")?.addEventListener("click", stopRecognitionJob);
}

function fillAssetConfig() {
  const config = state.currentConfig || {};
  setValue("assetStickerVisionEnabled", String(config.sticker_vision_enabled !== false));
  setValue("assetStickerVisionUrl", config.sticker_vision_url || config.vision_url || "");
  setValue("assetStickerVisionModel", config.sticker_vision_model || config.vision_model || "");
  setValue("assetStickerVisionTimeout", config.sticker_vision_timeout || 45);
  setValue("assetStickerVisionMaxTokens", config.sticker_vision_max_tokens || 420);
  const keyInput = $("#assetStickerVisionApiKey");
  if (keyInput) {
    keyInput.value = "";
    keyInput.placeholder = config.sticker_vision_api_key_masked || (config.sticker_vision_api_key_set ? "已保存，留空不修改" : "未设置");
  }
  setValue("assetStickersEnabled", String(config.stickers_enabled !== false));
  setValue("assetStickerActivity", config.sticker_activity || "active");
  setValue("assetStickerCooldownSec", config.sticker_cooldown_sec ?? 90);
  setValue("assetStickerDailyLimit", config.sticker_daily_limit ?? 60);
  setValue("assetStickerMaxStreak", config.sticker_max_streak ?? 2);
  setValue("assetStickerCustomProbability", config.sticker_custom_probability ?? 0.65);
}

async function saveAssetConfig() {
  const payload = {
    sticker_vision_enabled: value("assetStickerVisionEnabled", "true") === "true",
    sticker_vision_url: value("assetStickerVisionUrl", "").trim(),
    sticker_vision_model: value("assetStickerVisionModel", "").trim(),
    sticker_vision_timeout: Number(value("assetStickerVisionTimeout", 45)) || 45,
    sticker_vision_max_tokens: Number(value("assetStickerVisionMaxTokens", 420)) || 420,
  };
  const key = value("assetStickerVisionApiKey", "").trim();
  if (key) payload.sticker_vision_api_key = key;
  for (const [configKey, id, kind] of STICKER_CONFIG_FIELDS) {
    const raw = value(id, "");
    payload[configKey] = kind === "number" ? Number(raw) : (kind === "bool" ? raw === "true" : raw);
  }
  state.currentConfig = await saveConfig(payload);
  fillAssetConfig();
  showToast("素材配置已保存", "success");
}

async function refreshAssets() {
  const filters = currentFilters();
  await loadStickers(filters);
  selectedIds.forEach((id) => {
    if (!state.stickers.some((item) => item.id === id)) selectedIds.delete(id);
  });
  if (selectedStickerId && !state.stickers.some((item) => item.id === selectedStickerId)) selectedStickerId = "";
  renderStats();
  renderBulkBar();
  renderGallery();
  renderDetail(selectedSticker());
  renderIcons();
}

function currentFilters() {
  return {
    status: value("assetStickerStatusFilter", ""),
    emotion: value("assetStickerEmotionFilter", ""),
    q: value("assetStickerSearchInput", "").trim(),
  };
}

function selectedSticker() {
  return (state.stickers || []).find((item) => item.id === selectedStickerId) || null;
}

function renderStats() {
  const host = $("#assetStatsGrid");
  if (!host) return;
  const items = state.stickers || [];
  const count = (status) => items.filter((item) => item.review_status === status).length;
  host.innerHTML = "";
  for (const card of [
    ["当前视图", items.length],
    ["待审核", count("pending")],
    ["已通过", count("approved")],
    ["失败", count("failed")],
  ]) {
    const el = document.createElement("article");
    el.className = "asset-stat-card";
    el.innerHTML = `<small>${card[0]}</small><strong>${card[1]}</strong>`;
    host.appendChild(el);
  }
}

function renderBulkBar() {
  const count = selectedIds.size;
  const label = $("#assetSelectedCount");
  if (label) label.textContent = count ? `已选 ${count} 张` : "未选择";
  for (const id of ["assetBulkReanalyzeBtn", "assetBulkApproveBtn", "assetBulkDeleteBtn"]) {
    const button = $(`#${id}`);
    if (button) button.disabled = count === 0;
  }
}

function renderGallery() {
  const host = $("#assetStickerGallery");
  if (!host) return;
  const items = state.stickers || [];
  host.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "asset-empty";
    empty.textContent = "还没有素材。点击右上角批量上传 PNG、JPG 或 WebP。";
    host.appendChild(empty);
    return;
  }
  for (const sticker of items) {
    const card = document.createElement("article");
    card.className = `asset-card review-${sticker.review_status || "pending"}`;
    card.classList.toggle("active", sticker.id === selectedStickerId);
    card.classList.toggle("selected", selectedIds.has(sticker.id));

    const check = document.createElement("button");
    check.type = "button";
    check.className = "asset-card-check";
    check.title = selectedIds.has(sticker.id) ? "取消选择" : "选择";
    check.innerHTML = selectedIds.has(sticker.id) ? '<i data-lucide="check-square"></i>' : '<i data-lucide="square"></i>';
    check.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleStickerSelection(sticker.id);
    });

    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "asset-card-preview";
    preview.addEventListener("click", () => {
      selectedStickerId = sticker.id;
      renderGallery();
      renderDetail(sticker);
      renderIcons();
    });
    const img = document.createElement("img");
    img.src = sticker.thumbnail || sticker.url || sticker.file || sticker.send_file;
    img.alt = sticker.caption || sticker.name || "表情包";
    const meta = document.createElement("span");
    meta.innerHTML = `<strong>${escapeHtml(sticker.emotion || sticker.tag || "sticker")}</strong><small>${escapeHtml(statusLabel(sticker.review_status))} · 强度 ${Number(sticker.intensity || 3)}</small>`;
    preview.append(img, meta);
    card.append(check, preview);
    host.appendChild(card);
  }
}

function toggleStickerSelection(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  renderBulkBar();
  renderGallery();
  renderIcons();
}

function toggleSelectAllVisible() {
  const visibleIds = (state.stickers || []).map((item) => item.id).filter(Boolean);
  const allSelected = visibleIds.length && visibleIds.every((id) => selectedIds.has(id));
  if (allSelected) visibleIds.forEach((id) => selectedIds.delete(id));
  else visibleIds.forEach((id) => selectedIds.add(id));
  renderBulkBar();
  renderGallery();
  renderIcons();
}

function renderDetail(sticker) {
  const host = $("#assetStickerDetail");
  if (!host) return;
  if (!sticker) {
    host.className = "asset-detail-panel empty";
    host.textContent = "选择一张素材后，可以复核分类、标签和适用场景。";
    return;
  }
  host.className = "asset-detail-panel";
  host.innerHTML = `
    <div class="asset-detail-head">
      <img src="${escapeAttr(sticker.thumbnail || sticker.url || sticker.file || "")}" alt="preview" />
      <div><strong>${escapeHtml(sticker.name || sticker.id)}</strong><small>${escapeHtml(sticker.id)} · ${escapeHtml(statusLabel(sticker.review_status))}</small></div>
    </div>
    <label><span>名称</span><input data-asset-field="name" value="${escapeAttr(sticker.name || "")}" /></label>
    <label><span>主分类</span><input data-asset-field="emotion" value="${escapeAttr(sticker.emotion || "laugh")}" /></label>
    <label><span>标签</span><input data-asset-field="tags" value="${escapeAttr((sticker.tags || []).join("，"))}" /></label>
    <label><span>适用场景</span><textarea data-asset-field="scene">${escapeHtml((sticker.scene || []).join("，"))}</textarea></label>
    <label><span>禁用场景</span><textarea data-asset-field="avoid">${escapeHtml((sticker.avoid || []).join("，"))}</textarea></label>
    <label><span>说明</span><textarea data-asset-field="caption">${escapeHtml(sticker.caption || "")}</textarea></label>
    <label><span>OCR</span><textarea data-asset-field="ocr_text">${escapeHtml(sticker.ocr_text || "")}</textarea></label>
    <div class="asset-detail-actions">
      <button class="primary-action" data-asset-action="save" type="button"><i data-lucide="save"></i>保存</button>
      <button class="secondary-action" data-asset-action="approve" type="button"><i data-lucide="check"></i>通过</button>
      <button class="secondary-action" data-asset-action="reanalyze" type="button"><i data-lucide="scan-eye"></i>重新识别</button>
      <button class="icon-button danger" data-asset-action="delete" type="button" title="删除"><i data-lucide="trash-2"></i></button>
    </div>
    ${sticker.error ? `<div class="asset-error">${escapeHtml(sticker.error)}</div>` : ""}
  `;
  host.querySelector('[data-asset-action="save"]')?.addEventListener("click", () => saveDetail(sticker.id));
  host.querySelector('[data-asset-action="approve"]')?.addEventListener("click", () => approveAndRefresh(sticker.id));
  host.querySelector('[data-asset-action="reanalyze"]')?.addEventListener("click", () => reanalyzeAndRefresh(sticker.id));
  host.querySelector('[data-asset-action="delete"]')?.addEventListener("click", () => deleteAndRefresh(sticker.id));
}

async function uploadFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const valid = files.filter((file) => ["image/png", "image/jpeg", "image/webp"].includes(String(file.type || "").toLowerCase()));
  if (!valid.length) {
    showToast("请选择 PNG、JPG 或 WebP", "error");
    return;
  }
  const button = $("#assetStickerUploadBtn");
  try {
    setBusy(button, `正在入库 ${valid.length} 张...`);
    const payload = [];
    const limited = valid.slice(0, 120);
    updateProgress("正在读取素材", 0, limited.length, 0, "准备读取文件。");
    for (const [index, file] of limited.entries()) {
      payload.push({ name: file.name, data_url: await fileToDataUrl(file) });
      updateProgress("正在读取素材", index + 1, limited.length, 0, file.name);
    }
    updateProgress("正在提交入库", 0, payload.length, 0, "后端会保存素材并尝试自动识别。");
    const result = await uploadStickerBatch(payload, "all");
    const ok = (result.results || []).filter((item) => item.ok).length;
    const pending = (result.results || []).filter((item) => item.ok && item.analyzed === false && !item.duplicate).length;
    const duplicate = (result.results || []).filter((item) => item.duplicate).length;
    const failed = (result.results || []).filter((item) => !item.ok).length;
    showToast(`入库 ${ok} 张${duplicate ? `，重复 ${duplicate} 张` : ""}${pending ? `，${pending} 张待识别` : ""}，失败 ${failed} 张`, failed || pending ? "info" : "success");
    await refreshAssets();
  } finally {
    clearBusy(button, '<i data-lucide="image-plus"></i>批量上传');
    window.setTimeout(hideProgress, 1200);
    event.target.value = "";
  }
}

async function saveDetail(id) {
  const field = (name) => $(`[data-asset-field="${name}"]`)?.value || "";
  await updateSticker(id, {
    name: field("name"),
    emotion: field("emotion"),
    tags: splitList(field("tags")),
    scene: splitList(field("scene")),
    avoid: splitList(field("avoid")),
    caption: field("caption"),
    ocr_text: field("ocr_text"),
  });
  showToast("素材已保存", "success");
  await refreshAssets();
}

async function approveAndRefresh(id) {
  await approveSticker(id);
  showToast("素材已通过审核", "success");
  await refreshAssets();
}

async function reanalyzeAndRefresh(id) {
  await runRecognitionQueue([id], "单张素材");
}

async function deleteAndRefresh(id) {
  if (!(await showConfirm("删除这张素材？"))) return;
  await deleteSticker(id);
  selectedIds.delete(id);
  selectedStickerId = "";
  await refreshAssets();
}

async function runBulk(action, includeFiltered) {
  const ids = includeFiltered ? [] : Array.from(selectedIds);
  const filters = currentFilters();
  const scopeText = includeFiltered ? "当前筛选结果" : `${ids.length} 张选中素材`;
  if (!includeFiltered && !ids.length) {
    showToast("先选择素材", "info");
    return;
  }
  if (action === "delete") {
    const ok = await showConfirm(`删除${scopeText}？这个操作会移除素材文件。`);
    if (!ok) return;
  }
  if (action === "reanalyze") {
    const targets = includeFiltered ? (state.stickers || []).map((item) => item.id).filter(Boolean) : ids;
    if (!targets.length) {
      showToast("当前没有可识别的素材", "info");
      return;
    }
    await runRecognitionQueue(targets, includeFiltered ? "当前筛选结果" : "选中素材");
    return;
  }
  const button = bulkButton(action, includeFiltered);
  try {
    setBusy(button, actionBusyText(action));
    const result = await bulkStickerAction(action, ids, { include_filtered: includeFiltered, filters });
    if (action === "delete") {
      selectedIds.clear();
      selectedStickerId = "";
    }
    showToast(`${actionLabel(action)}完成：成功 ${result.success || 0}，失败 ${result.failed || 0}`, result.failed ? "info" : "success");
    await refreshAssets();
  } finally {
    clearBusy(button, button?.dataset.label || "");
  }
}

async function runRecognitionQueue(ids, label) {
  if (recognitionJob?.running) {
    showToast("已有识别任务正在运行", "info");
    return;
  }
  const queue = Array.from(new Set((ids || []).filter(Boolean)));
  if (!queue.length) return;
  recognitionJob = { running: true, cancelled: false, total: queue.length, done: 0, failed: 0 };
  setRecognitionControls(true);
  updateProgress(`正在识别${label}`, 0, queue.length, 0, "准备开始。");
  try {
    for (const id of queue) {
      if (recognitionJob.cancelled) break;
      const sticker = (state.stickers || []).find((item) => item.id === id);
      updateProgress(`正在识别${label}`, recognitionJob.done, queue.length, recognitionJob.failed, sticker?.name || id);
      try {
        await reanalyzeSticker(id);
      } catch (error) {
        recognitionJob.failed += 1;
      } finally {
        recognitionJob.done += 1;
        updateProgress(`正在识别${label}`, recognitionJob.done, queue.length, recognitionJob.failed, sticker?.name || id);
      }
    }
    const stopped = recognitionJob.cancelled;
    showToast(
      stopped
        ? `识别已停止：完成 ${recognitionJob.done}/${recognitionJob.total}，失败 ${recognitionJob.failed}`
        : `识别完成：完成 ${recognitionJob.done}/${recognitionJob.total}，失败 ${recognitionJob.failed}`,
      recognitionJob.failed ? "info" : "success",
    );
  } finally {
    if (recognitionJob) recognitionJob.running = false;
    setRecognitionControls(false);
    await refreshAssets();
    window.setTimeout(() => {
      if (!recognitionJob || !recognitionJob.running) hideProgress();
    }, 1200);
    recognitionJob = null;
  }
}

function stopRecognitionJob() {
  if (!recognitionJob?.running) return;
  recognitionJob.cancelled = true;
  const stop = $("#assetBulkStopBtn");
  if (stop) {
    stop.disabled = true;
    stop.textContent = "正在停止...";
  }
  updateProgress("正在停止识别", recognitionJob.done, recognitionJob.total, recognitionJob.failed, "当前素材完成后停止。");
}

function setRecognitionControls(running) {
  for (const id of ["assetBulkReanalyzeBtn", "assetBulkReanalyzeAllBtn", "assetStickerVisionTestBtn"]) {
    const button = $(`#${id}`);
    if (button) button.disabled = running;
  }
  const stop = $("#assetBulkStopBtn");
  if (stop) {
    stop.disabled = !running;
    stop.innerHTML = '<i data-lucide="pause-circle"></i>停止识别';
  }
  renderIcons();
}

function updateProgress(title, done, total, failed, detail) {
  const panel = $("#assetProgressPanel");
  if (panel) panel.hidden = false;
  const percent = total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
  const bar = $("#assetProgressBar");
  if (bar) bar.style.width = `${percent}%`;
  const titleNode = $("#assetProgressTitle");
  if (titleNode) titleNode.textContent = title;
  const count = $("#assetProgressCount");
  if (count) count.textContent = `${done} / ${total}${failed ? ` · 失败 ${failed}` : ""}`;
  const detailNode = $("#assetProgressDetail");
  if (detailNode) detailNode.textContent = detail || "正在处理。";
}

function hideProgress() {
  const panel = $("#assetProgressPanel");
  if (panel) panel.hidden = true;
}

function bulkButton(action, includeFiltered) {
  const id = {
    "reanalyze:false": "assetBulkReanalyzeBtn",
    "approve:false": "assetBulkApproveBtn",
    "delete:false": "assetBulkDeleteBtn",
    "reanalyze:true": "assetBulkReanalyzeAllBtn",
    "approve:true": "assetBulkApproveAllBtn",
    "delete:true": "assetBulkDeleteAllBtn",
  }[`${action}:${includeFiltered}`];
  return id ? $(`#${id}`) : null;
}

async function runPolicyTest() {
  const host = $("#assetStickerTestResult");
  if (host) {
    host.className = "asset-test-result loading";
    host.textContent = "测试中...";
  }
  const result = await testSticker(value("assetStickerTestInput", ""), value("assetStickerTestChannel", "web"));
  const sticker = result.sticker;
  if (!host) return;
  host.className = `asset-test-result ${sticker ? "hit" : "miss"}`;
  const diag = result.diagnostics || {};
  const scoreText = diag.score === undefined || diag.score === null ? "--" : Number(diag.score).toFixed(2);
  const thresholdText = diag.threshold === undefined || diag.threshold === null ? "--" : Number(diag.threshold).toFixed(2);
  const matched = (diag.matched_fields || []).join("、") || "无";
  if (sticker) {
    host.innerHTML = `
      <strong>命中：${escapeHtml(sticker.name || sticker.id)}</strong>
      <span>语境：${escapeHtml(diag.tag || sticker.tag || sticker.emotion || "")} · 分数 ${escapeHtml(scoreText)} / 阈值 ${escapeHtml(thresholdText)}</span>
      <span>原因：${escapeHtml(matched)}</span>
    `;
  } else {
    host.innerHTML = `
      <strong>未命中</strong>
      <span>原因：${escapeHtml(result.intent?.reason || diag.reason || "unknown")}</span>
      <span>语境：${escapeHtml(diag.tag || "无明确语义")} · 分数 ${escapeHtml(scoreText)} / 阈值 ${escapeHtml(thresholdText)}</span>
    `;
  }
}

async function runVisionTest() {
  const sticker = selectedSticker();
  if (!sticker) {
    showToast("先选择一张素材再测试识别 API", "info");
    return;
  }
  const result = await testStickerVision({ sticker_id: sticker.id });
  if (result.ok) {
    showToast(`识别 API 可用：${result.vision_model || "model"}`, "success");
  } else {
    showToast(`识别 API 不可用：${result.error}`, "error");
  }
}

function setBusy(button, label) {
  if (!button) return;
  button.dataset.label = button.innerHTML;
  button.disabled = true;
  button.textContent = label;
}

function clearBusy(button, fallbackHtml) {
  if (!button) return;
  button.disabled = false;
  button.innerHTML = button.dataset.label || fallbackHtml;
  delete button.dataset.label;
  renderIcons();
}

function actionLabel(action) {
  return { reanalyze: "识别", approve: "通过", delete: "删除" }[action] || action;
}

function actionBusyText(action) {
  return { reanalyze: "识别中...", approve: "通过中...", delete: "删除中..." }[action] || "处理中...";
}

function statusLabel(status) {
  return { pending: "待审核", approved: "已通过", failed: "失败", disabled: "停用" }[status] || (status || "待审核");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function splitList(text) {
  return String(text || "").split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 10);
}

function escapeHtml(input) {
  return String(input || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(input) {
  return escapeHtml(input).replace(/`/g, "&#96;");
}
