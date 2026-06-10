import { state, DEFAULT_CONFIG } from "../stores/state.js";
import { fetchJson } from "./client.js";

export async function loadConfig() {
  try {
    const config = await fetchJson("/api/config");
    state.previewMode = false;
    state.currentConfig = { ...DEFAULT_CONFIG, ...config };
    state.ttsSampleRate = Number(config.tts_sample_rate || 24000);
    applyUiFontScale(state.currentConfig.ui_font_scale);
    return { ok: true, config: state.currentConfig };
  } catch (error) {
    state.previewMode = true;
    state.currentConfig = { ...DEFAULT_CONFIG };
    state.ttsSampleRate = DEFAULT_CONFIG.tts_sample_rate;
    applyUiFontScale(DEFAULT_CONFIG.ui_font_scale);
    return { ok: false, error, config: state.currentConfig };
  }
}

export function applyUiFontScale(value) {
  const scale = Number(value);
  const safeScale = Number.isFinite(scale) ? Math.max(0.85, Math.min(1.35, scale)) : 1;
  document.documentElement.style.setProperty("--ui-font-scale", String(safeScale));
}

export async function saveConfig(configData) {
  return fetchJson("/api/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(configData),
  });
}

export async function loadToolConfig() {
  const data = await fetchJson("/api/config/tools");
  state.toolConfig = data.tools || {};
  return state.toolConfig;
}

export async function saveToolConfig(tools) {
  const data = await fetchJson("/api/config/tools", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tools),
  });
  state.toolConfig = data.tools || {};
  return state.toolConfig;
}

export async function listModelFiles(root = "", query = "") {
  const params = new URLSearchParams();
  if (root) params.set("root", root);
  if (query) params.set("query", query);
  return fetchJson(`/api/files/models?${params.toString()}`);
}
