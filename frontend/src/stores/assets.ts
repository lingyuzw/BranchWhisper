import { defineStore } from "pinia";
import {
  approveSticker,
  bulkStickerAction,
  deleteSticker,
  loadStickers,
  reanalyzeSticker,
  testSticker,
  uploadStickerBatch,
  type Sticker,
  type StickerFilters,
  type StickerUploadFile,
} from "@/api/assets";
import { loadConfig, saveConfig, type PublicConfig } from "@/api/config";

interface AssetProgress {
  active: boolean;
  label: string;
  done: number;
  total: number;
  failed: number;
}

interface AssetConfigForm {
  sticker_vision_enabled: boolean;
  sticker_vision_url: string;
  sticker_vision_model: string;
  sticker_vision_api_key: string;
  sticker_vision_api_key_masked: string;
  sticker_vision_timeout: number;
  sticker_vision_max_tokens: number;
  stickers_enabled: boolean;
  sticker_activity: string;
  sticker_cooldown_sec: number;
  sticker_daily_limit: number;
  sticker_max_streak: number;
  sticker_custom_probability: number;
}

interface AssetState {
  stickers: Sticker[];
  selectedId: string;
  selectedIds: string[];
  filters: StickerFilters;
  loading: boolean;
  configLoading: boolean;
  error: string;
  configMessage: string;
  progress: AssetProgress;
  cancelRequested: boolean;
  config: AssetConfigForm;
  testText: string;
  testChannel: string;
  testResult: Record<string, unknown> | null;
}

function initialProgress(): AssetProgress {
  return { active: false, label: "", done: 0, total: 0, failed: 0 };
}

function defaultAssetConfig(): AssetConfigForm {
  return {
    sticker_vision_enabled: true,
    sticker_vision_url: "",
    sticker_vision_model: "",
    sticker_vision_api_key: "",
    sticker_vision_api_key_masked: "",
    sticker_vision_timeout: 45,
    sticker_vision_max_tokens: 420,
    stickers_enabled: true,
    sticker_activity: "active",
    sticker_cooldown_sec: 90,
    sticker_daily_limit: 60,
    sticker_max_streak: 2,
    sticker_custom_probability: 0.65,
  };
}

function configFromPublic(config: PublicConfig): AssetConfigForm {
  return {
    sticker_vision_enabled: Boolean(config.sticker_vision_enabled ?? true),
    sticker_vision_url: String(config.sticker_vision_url || config.vision_url || ""),
    sticker_vision_model: String(config.sticker_vision_model || config.vision_model || ""),
    sticker_vision_api_key: "",
    sticker_vision_api_key_masked: String(config.sticker_vision_api_key_masked || ""),
    sticker_vision_timeout: Number(config.sticker_vision_timeout || 45),
    sticker_vision_max_tokens: Number(config.sticker_vision_max_tokens || 420),
    stickers_enabled: Boolean(config.stickers_enabled ?? true),
    sticker_activity: String(config.sticker_activity || "active"),
    sticker_cooldown_sec: Number(config.sticker_cooldown_sec || 90),
    sticker_daily_limit: Number(config.sticker_daily_limit || 60),
    sticker_max_streak: Number(config.sticker_max_streak || 2),
    sticker_custom_probability: Number(config.sticker_custom_probability ?? 0.65),
  };
}

export const useAssetsStore = defineStore("assets", {
  state: (): AssetState => ({
    stickers: [],
    selectedId: "",
    selectedIds: [],
    filters: {},
    loading: false,
    configLoading: false,
    error: "",
    configMessage: "",
    progress: initialProgress(),
    cancelRequested: false,
    config: defaultAssetConfig(),
    testText: "打一架?",
    testChannel: "web",
    testResult: null,
  }),
  getters: {
    selected(state) {
      return state.stickers.find((item) => item.id === state.selectedId) || state.stickers[0] || null;
    },
    progressPercent(state) {
      if (!state.progress.total) return 0;
      return Math.round((state.progress.done / state.progress.total) * 100);
    },
  },
  actions: {
    async reload(filters?: StickerFilters) {
      this.loading = true;
      this.error = "";
      this.filters = { ...(filters || this.filters) };
      try {
        const data = await loadStickers(this.filters);
        this.stickers = data.stickers || [];
        if (this.selectedId && !this.stickers.some((item) => item.id === this.selectedId)) {
          this.selectedId = this.stickers[0]?.id || "";
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async loadConfig() {
      this.configLoading = true;
      this.configMessage = "";
      try {
        this.config = configFromPublic(await loadConfig());
      } catch (error) {
        this.configMessage = `读取素材配置失败：${error instanceof Error ? error.message : String(error)}`;
      } finally {
        this.configLoading = false;
      }
    },
    async saveConfig() {
      this.configLoading = true;
      this.configMessage = "";
      const payload: Partial<PublicConfig> = {
        sticker_vision_enabled: this.config.sticker_vision_enabled,
        sticker_vision_url: this.config.sticker_vision_url,
        sticker_vision_model: this.config.sticker_vision_model,
        sticker_vision_timeout: this.config.sticker_vision_timeout,
        sticker_vision_max_tokens: this.config.sticker_vision_max_tokens,
        stickers_enabled: this.config.stickers_enabled,
        sticker_activity: this.config.sticker_activity as PublicConfig["sticker_activity"],
        sticker_cooldown_sec: this.config.sticker_cooldown_sec,
        sticker_daily_limit: this.config.sticker_daily_limit,
        sticker_max_streak: this.config.sticker_max_streak,
        sticker_custom_probability: this.config.sticker_custom_probability,
      };
      if (this.config.sticker_vision_api_key.trim()) {
        payload.sticker_vision_api_key = this.config.sticker_vision_api_key.trim();
      }
      try {
        this.config = configFromPublic(await saveConfig(payload));
        this.configMessage = "素材配置已保存";
      } catch (error) {
        this.configMessage = `保存失败：${error instanceof Error ? error.message : String(error)}`;
        throw error;
      } finally {
        this.configLoading = false;
      }
    },
    async upload(files: StickerUploadFile[]) {
      if (!files.length) return;
      this.progress = { active: true, label: "上传素材", done: 0, total: files.length, failed: 0 };
      this.error = "";
      try {
        const data = await uploadStickerBatch(files, "all");
        this.stickers = data.stickers || this.stickers;
        const uploaded = (data.results || []).filter((item) => item.ok && item.sticker).map((item) => item.sticker as Sticker);
        this.progress.failed = (data.results || []).filter((item) => !item.ok).length;
        this.selectedIds = uploaded.map((item) => item.id);
        this.selectedId = uploaded[0]?.id || this.selectedId;
        this.progress.done = files.length;
        await this.reload(this.filters);
        if (uploaded.length) await this.recognize(uploaded.map((item) => item.id), "识别新素材");
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.progress.active = false;
      }
    },
    async recognize(ids: string[], label = "识别素材") {
      const targets = ids.filter(Boolean);
      if (!targets.length) return;
      this.cancelRequested = false;
      this.progress = { active: true, label, done: 0, total: targets.length, failed: 0 };
      for (const id of targets) {
        if (this.cancelRequested) break;
        try {
          const data = await reanalyzeSticker(id);
          this.stickers = data.stickers || this.stickers;
          if (data.sticker?.id) this.selectedId = data.sticker.id;
        } catch {
          this.progress.failed += 1;
        } finally {
          this.progress.done += 1;
        }
      }
      await this.reload(this.filters);
      this.progress.active = false;
      this.cancelRequested = false;
    },
    cancelProgress() {
      this.cancelRequested = true;
    },
    async bulk(action: "reanalyze" | "approve" | "delete", ids: string[], label: string, includeFiltered = false) {
      const targets = ids.filter(Boolean);
      if (!includeFiltered && !targets.length) return;
      this.progress = { active: true, label, done: 0, total: includeFiltered ? this.stickers.length || 1 : targets.length, failed: 0 };
      try {
        const data = await bulkStickerAction({ action, ids: targets, include_filtered: includeFiltered, filters: this.filters });
        this.stickers = data.stickers || this.stickers;
        this.progress.done = data.count || this.progress.total;
        this.progress.failed = data.failed || 0;
        if (action === "delete") this.selectedIds = [];
        if (this.selectedId && !this.stickers.some((item) => item.id === this.selectedId)) {
          this.selectedId = this.stickers[0]?.id || "";
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        this.progress.failed += 1;
      } finally {
        await this.reload(this.filters);
        this.progress.active = false;
      }
    },
    async approve(ids: string[]) {
      const targets = ids.filter(Boolean);
      this.progress = { active: true, label: "通过素材", done: 0, total: targets.length, failed: 0 };
      for (const id of targets) {
        const data = await approveSticker(id);
        this.stickers = data.stickers || this.stickers;
        this.progress.done += 1;
      }
      await this.reload(this.filters);
      this.progress.active = false;
    },
    async remove(ids: string[]) {
      const targets = ids.filter(Boolean);
      this.progress = { active: true, label: "删除素材", done: 0, total: targets.length, failed: 0 };
      for (const id of targets) {
        const data = await deleteSticker(id);
        this.stickers = data.stickers || this.stickers;
        this.progress.done += 1;
      }
      this.selectedIds = [];
      await this.reload(this.filters);
      this.progress.active = false;
    },
    async runTest() {
      this.testResult = await testSticker(this.testText || "哈哈哈哈", this.testChannel || "web");
    },
  },
});
