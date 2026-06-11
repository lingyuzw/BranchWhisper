import { defineStore } from "pinia";
import {
  addMemory,
  deleteMemory,
  loadMemory,
  runMemoryDecay,
  testMemoryAdmission,
  type MemoryAdmissionResult,
  type MemoryItem,
  type MemoryLayer,
} from "@/api/memory";

interface MemoryState {
  items: MemoryItem[];
  query: string;
  layer: MemoryLayer;
  mode: string;
  page: number;
  pageSize: number;
  dbPath: string;
  selectedId: string;
  loading: boolean;
  error: string;
  addText: string;
  admissionText: string;
  admissionResults: MemoryAdmissionResult[];
}

export const useMemoryStore = defineStore("memory", {
  state: (): MemoryState => ({
    items: [],
    query: "",
    layer: "",
    mode: "",
    page: 1,
    pageSize: 30,
    dbPath: "",
    selectedId: "",
    loading: false,
    error: "",
    addText: "",
    admissionText: "我喜欢晚上写代码，猫叫布丁。",
    admissionResults: [],
  }),
  getters: {
    stats(state) {
      return {
        total: state.items.length,
        short: state.items.filter((item) => item.layer === "short").length,
        mid: state.items.filter((item) => item.layer === "mid").length,
        long: state.items.filter((item) => item.layer === "long").length,
      };
    },
    filtered(state) {
      const q = state.query.trim().toLowerCase();
      return state.items.filter((item) => {
        if (state.layer && item.layer !== state.layer) return false;
        if (!q) return true;
        return `${item.key || ""} ${item.value || ""} ${item.memory_type || ""}`.toLowerCase().includes(q);
      });
    },
    pageCount(): number {
      return Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
    },
    paged(): MemoryItem[] {
      const start = (this.page - 1) * this.pageSize;
      return this.filtered.slice(start, start + this.pageSize);
    },
    selected(state): MemoryItem | null {
      return state.items.find((item) => item.id === state.selectedId) || this.paged[0] || null;
    },
  },
  actions: {
    async reload() {
      this.loading = true;
      this.error = "";
      try {
        const data = await loadMemory(260, "", "", this.mode);
        this.items = data.items || [];
        this.mode = data.mode || this.mode;
        this.dbPath = data.db_path || "";
        if (this.page > this.pageCount) this.page = this.pageCount;
        if (this.selectedId && !this.items.some((item) => item.id === this.selectedId)) this.selectedId = "";
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    setLayer(layer: MemoryLayer) {
      this.layer = layer;
      this.page = 1;
    },
    setQuery(query: string) {
      this.query = query;
      this.page = 1;
    },
    async create() {
      const text = this.addText.trim();
      if (!text) return;
      await addMemory(text, this.mode || "", "mid");
      this.addText = "";
      await this.reload();
    },
    async remove(id: string) {
      await deleteMemory(id);
      if (this.selectedId === id) this.selectedId = "";
      await this.reload();
    },
    async decay() {
      await runMemoryDecay(this.mode || "");
      await this.reload();
    },
    async testAdmission() {
      const text = this.admissionText.trim();
      if (!text) return;
      const data = await testMemoryAdmission(text);
      this.admissionResults = data.results || [];
    },
  },
});
