import { state } from "../stores/state.js";
import {
  approveSticker,
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
import { $, createIcon, renderIcons, setValue, showToast, value } from "../utils/dom.js";

let bound = false;
let selectedStickerId = "";

export async function initAssetsPage() {
  bindEvents();
  await loadConfig();
  fillVisionConfig();
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
  $("#assetStickerConfigSaveBtn")?.addEventListener("click", saveVisionConfig);
  $("#assetStickerStatusFilter")?.addEventListener("change", refreshAssets);
  $("#assetStickerEmotionFilter")?.addEventListener("change", refreshAssets);
  $("#assetStickerSearchInput")?.addEventListener("input", () => {
    window.clearTimeout(state.assetSearchTimer);
    state.assetSearchTimer = window.setTimeout(refreshAssets, 220);
  });
  $("#assetStickerTestBtn")?.addEventListener("click", runPolicyTest);
}

function fillVisionConfig() {
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
}

async function saveVisionConfig() {
  const payload = {
    sticker_vision_enabled: value("assetStickerVisionEnabled", "true") === "true",
    sticker_vision_url: value("assetStickerVisionUrl", "").trim(),
    sticker_vision_model: value("assetStickerVisionModel", "").trim(),
    sticker_vision_timeout: Number(value("assetStickerVisionTimeout", 45)) || 45,
    sticker_vision_max_tokens: Number(value("assetStickerVisionMaxTokens", 420)) || 420,
  };
  const key = value("assetStickerVisionApiKey", "").trim();
  if (key) payload.sticker_vision_api_key = key;
  state.currentConfig = await saveConfig(payload);
  fillVisionConfig();
  showToast("素材识别配置已保存", "success");
}

async function refreshAssets() {
  const filters = {
    status: value("assetStickerStatusFilter", ""),
    emotion: value("assetStickerEmotionFilter", ""),
    q: value("assetStickerSearchInput", "").trim(),
  };
  await loadStickers(filters);
  renderStats();
  renderGallery();
  renderDetail(selectedSticker());
  renderIcons();
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
    ["总素材", items.length],
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
    const card = document.createElement("button");
    card.type = "button";
    card.className = `asset-card review-${sticker.review_status || "pending"}`;
    card.classList.toggle("active", sticker.id === selectedStickerId);
    const img = document.createElement("img");
    img.src = sticker.thumbnail || sticker.url || sticker.file || sticker.send_file;
    img.alt = sticker.caption || sticker.name || "表情包";
    const meta = document.createElement("span");
    meta.innerHTML = `<strong>${escapeHtml(sticker.emotion || sticker.tag || "sticker")}</strong><small>${escapeHtml(sticker.review_status || "pending")} · 强度 ${Number(sticker.intensity || 3)}</small>`;
    card.append(img, meta);
    card.addEventListener("click", () => {
      selectedStickerId = sticker.id;
      renderGallery();
      renderDetail(sticker);
      renderIcons();
    });
    host.appendChild(card);
  }
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
      <div><strong>${escapeHtml(sticker.name || sticker.id)}</strong><small>${escapeHtml(sticker.id)} · ${escapeHtml(sticker.review_status || "pending")}</small></div>
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
    if (button) {
      button.disabled = true;
      button.textContent = `正在入库 ${valid.length} 张...`;
    }
    const payload = [];
    for (const file of valid.slice(0, 80)) payload.push({ name: file.name, data_url: await fileToDataUrl(file) });
    const result = await uploadStickerBatch(payload, "all");
    const ok = (result.results || []).filter((item) => item.ok).length;
    const pending = (result.results || []).filter((item) => item.ok && item.analyzed === false && !item.duplicate).length;
    const failed = (result.results || []).filter((item) => !item.ok).length;
    showToast(`入库 ${ok} 张${pending ? `，${pending} 张待识别` : ""}，失败 ${failed} 张`, failed || pending ? "info" : "success");
    await refreshAssets();
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = `<i data-lucide="image-plus"></i>批量上传`;
      renderIcons();
    }
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
  showToast("正在重新识别...", "info");
  await reanalyzeSticker(id);
  await refreshAssets();
}

async function deleteAndRefresh(id) {
  if (!confirm("删除这张素材？")) return;
  await deleteSticker(id);
  selectedStickerId = "";
  await refreshAssets();
}

async function runPolicyTest() {
  const host = $("#assetStickerTestResult");
  if (host) host.textContent = "测试中...";
  const result = await testSticker(value("assetStickerTestInput", ""), value("assetStickerTestChannel", "web"));
  const sticker = result.sticker;
  if (!host) return;
  host.textContent = sticker
    ? `命中：${sticker.name || sticker.id} · ${sticker.tag || sticker.emotion}`
    : `未命中：${result.intent?.reason || "unknown"}`;
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

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
