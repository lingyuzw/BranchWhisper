import { defineStore } from "pinia";
import {
  approveSticker,
  deleteSticker,
  loadStickers,
  reanalyzeSticker,
  testSticker,
  uploadStickerBatch,
  type Sticker,
  type StickerFilters,
  type StickerUploadFile,
} from "@/api/assets";

interface AssetProgress {
  active: boolean;
  label: string;
  done: number;
  total: number;
  failed: number;
}

interface AssetState {
  stickers: Sticker[];
  selectedId: string;
  selectedIds: string[];
  filters: StickerFilters;
  loading: boolean;
  error: string;
  progress: AssetProgress;
  testText: string;
  testResult: Record<string, unknown> | null;
}

function initialProgress(): AssetProgress {
  return { active: false, label: "", done: 0, total: 0, failed: 0 };
}

export const useAssetsStore = defineStore("assets", {
  state: (): AssetState => ({
    stickers: [],
    selectedId: "",
    selectedIds: [],
    filters: {},
    loading: false,
    error: "",
    progress: initialProgress(),
    testText: "打一架?",
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
    async upload(files: StickerUploadFile[]) {
      if (!files.length) return;
      this.progress = { active: true, label: "上传素材", done: 0, total: files.length, failed: 0 };
      this.error = "";
      try {
        const data = await uploadStickerBatch(files, "all");
        this.stickers = data.stickers || this.stickers;
        const uploaded = (data.results || []).filter((item) => item.ok && item.sticker).map((item) => item.sticker as Sticker);
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
      this.progress = { active: true, label, done: 0, total: targets.length, failed: 0 };
      for (const id of targets) {
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
      this.testResult = await testSticker(this.testText || "哈哈哈哈", "web");
    },
  },
});
