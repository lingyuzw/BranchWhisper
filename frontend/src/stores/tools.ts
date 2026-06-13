import { defineStore } from "pinia";
import { loadToolsConfig, resolveTool, saveToolsConfig, testTool, type ToolProviderConfig, type ToolResolveResult } from "@/api/tools";

export const PROVIDER_FIELDS: Record<string, string[]> = {
  weather: ["enabled", "provider", "base_url", "api_key", "default_location"],
  search: ["enabled", "provider", "base_url", "api_key", "limit"],
  news: ["enabled", "provider", "base_url", "api_key", "region", "limit"],
  finance: ["enabled", "provider", "base_url", "api_key"],
  map: ["enabled", "provider", "base_url", "api_key"],
  url_fetch: ["enabled", "user_agent", "max_chars"],
  reminder: ["enabled", "web_enabled", "weixin_enabled", "webhook_url"],
};

export const PROVIDER_LABELS: Record<string, string> = {
  weather: "天气",
  search: "搜索",
  news: "新闻",
  finance: "财经",
  map: "地图",
  url_fetch: "网页读取",
  reminder: "提醒通知",
};

export const PROVIDER_OPTIONS: Record<string, Array<[string, string]>> = {
  weather: [["gaode", "高德天气"], ["wttr", "wttr.in 免密天气"]],
  search: [["gaode", "高德地点搜索"], ["duckduckgo", "DuckDuckGo 网页搜索"]],
  news: [["google_rss", "Google News RSS"], ["search", "网页搜索兜底"]],
  finance: [["search", "网页搜索兜底"]],
  map: [["gaode", "高德地图 Web服务"]],
  url_fetch: [["built-in", "内置网页读取"]],
  reminder: [["default", "内置提醒"]],
};

interface ToolsState {
  config: ToolProviderConfig;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  error: string;
  resolveText: string;
  resolveResult: ToolResolveResult | null;
  testResults: Record<string, string>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function normalizeToolValue(value: unknown) {
  if (value === undefined || value === null) return "";
  return value;
}

function verifySavedToolsConfig(sent: ToolProviderConfig, verified: ToolProviderConfig) {
  for (const [providerKey, provider] of Object.entries(sent || {})) {
    if (!provider || typeof provider !== "object") continue;
    const verifiedProvider = verified[providerKey] || {};
    for (const [field, value] of Object.entries(provider)) {
      if (field.endsWith("_masked") || field.endsWith("_set")) continue;
      if (["api_key", "webhook_url", "token", "secret"].includes(field)) {
        if (String(value || "").trim() && !String(value).includes("*") && !verifiedProvider[`${field}_set`]) {
          throw new Error(`保存后校验失败：${PROVIDER_LABELS[providerKey] || providerKey} ${field} 未写入`);
        }
        continue;
      }
      if (JSON.stringify(normalizeToolValue(value)) !== JSON.stringify(normalizeToolValue(verifiedProvider[field]))) {
        throw new Error(`保存后校验失败：${PROVIDER_LABELS[providerKey] || providerKey} ${field} 回显不一致`);
      }
    }
  }
}

export const useToolsStore = defineStore("tools", {
  state: (): ToolsState => ({
    config: {},
    loading: false,
    saving: false,
    dirty: false,
    error: "",
    resolveText: "漳州今天天气怎么样",
    resolveResult: null,
    testResults: {},
  }),
  getters: {
    providers(state) {
      return Object.keys(PROVIDER_FIELDS).map((key) => ({ key, label: PROVIDER_LABELS[key] || key, config: state.config[key] || {} }));
    },
  },
  actions: {
    async reload() {
      this.loading = true;
      this.error = "";
      try {
        this.config = await loadToolsConfig();
        this.dirty = false;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async save() {
      if (!this.dirty) return;
      this.saving = true;
      this.error = "";
      try {
        const sent = clone(this.config);
        await saveToolsConfig(sent);
        const verified = await loadToolsConfig();
        verifySavedToolsConfig(sent, verified);
        this.config = verified;
        this.dirty = false;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.saving = false;
      }
    },
    setProviderField(providerKey: string, field: string, value: unknown) {
      const provider = { ...(this.config[providerKey] || {}) };
      if (provider[field] === value) return;
      provider[field] = value;
      this.config = { ...this.config, [providerKey]: provider };
      this.dirty = true;
    },
    async runResolve() {
      const text = this.resolveText.trim();
      if (!text) return;
      this.resolveResult = await resolveTool(text);
    },
    clearResolve() {
      this.resolveText = "";
      this.resolveResult = null;
    },
    async runProviderTest(providerKey: string) {
      const weatherLocation = String(this.config.weather?.default_location || "漳州").trim() || "漳州";
      const args: Record<string, Record<string, unknown>> = {
        weather: { location: weatherLocation },
        search: { query: "BranchWhisper" },
        news: { query: "AI" },
        finance: { symbol: "AAPL" },
        map: { query: `${weatherLocation}市政府` },
        url_fetch: { url: "https://example.com" },
        reminder: { title: "测试提醒", due_at: new Date(Date.now() + 3600_000).toISOString() },
      };
      this.testResults[providerKey] = "测试中...";
      try {
        const toolByProvider: Record<string, string> = { url_fetch: "url_fetch", reminder: "reminder" };
        const result = await testTool(toolByProvider[providerKey] || providerKey, args[providerKey] || {});
        this.testResults[providerKey] = JSON.stringify(result, null, 2);
      } catch (error) {
        this.testResults[providerKey] = `测试失败：${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },
});
