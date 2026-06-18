import { defineStore } from "pinia";
import { loadConfig, saveConfig, type PublicConfig } from "@/api/config";
import { loadServices, type ServiceSummary } from "@/api/services";

interface AppState {
  config: PublicConfig | null;
  services: ServiceSummary[];
  loading: boolean;
  error: string;
}

function applyUiPreferences(config: PublicConfig | null) {
  const scale = Number(config?.ui_font_scale || 1);
  document.documentElement.style.setProperty("--ui-font-scale", String(Number.isFinite(scale) ? scale : 1));
  document.documentElement.classList.toggle("theme-light", window.localStorage.getItem("branchwhisper:theme") === "light");
}

const SECRET_KEYS = new Set(["llm_api_key", "api_llm_api_key", "api_asr_api_key", "api_tts_api_key", "sticker_vision_api_key"]);

function normalizedConfigValue(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  return value;
}

function verifySavedConfig(patch: Partial<PublicConfig>, verified: PublicConfig) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    if (SECRET_KEYS.has(key)) {
      if (String(value || "").trim() && !verified[`${key}_set`]) {
        throw new Error(`保存后校验失败：${key} 未写入`);
      }
      continue;
    }
    if (JSON.stringify(normalizedConfigValue(value)) !== JSON.stringify(normalizedConfigValue(verified[key]))) {
      throw new Error(`保存后校验失败：${key} 回显不一致`);
    }
  }
}

export const useAppStore = defineStore("app", {
  state: (): AppState => ({
    config: null,
    services: [],
    loading: false,
    error: "",
  }),
  actions: {
    async bootstrap() {
      this.loading = true;
      this.error = "";
      try {
        const [config, services] = await Promise.all([loadConfig(), loadServices()]);
        this.config = config;
        this.services = services.services || [];
        applyUiPreferences(config);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async saveConfig(patch: Partial<PublicConfig>) {
      this.loading = true;
      this.error = "";
      try {
        await saveConfig(patch);
        const verified = await loadConfig();
        verifySavedConfig(patch, verified);
        this.config = verified;
        applyUiPreferences(this.config);
        window.dispatchEvent(new CustomEvent("branchwhisper:config-updated", { detail: { config: this.config } }));
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },
});
