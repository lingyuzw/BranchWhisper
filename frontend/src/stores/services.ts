import { defineStore } from "pinia";
import {
  clearAllServiceLogs,
  clearServiceLogs,
  fetchServiceLogs,
  loadServices,
  loadSystemResources,
  startAllServices,
  startService,
  stopAllServices,
  stopService,
  updateServiceConfig,
  type ServiceActionResponse,
  type ServiceSummary,
} from "@/api/services";

type PendingState = "starting" | "stopping" | "restarting" | "";

interface ServicesState {
  services: ServiceSummary[];
  resources: Record<string, unknown> | null;
  selectedId: string;
  logs: string;
  loading: boolean;
  resourceLoading: boolean;
  logLoading: boolean;
  error: string;
  pending: Record<string, PendingState>;
  bulkPending: PendingState;
  live: boolean;
  pollHandle: number | null;
  resourceHandle: number | null;
  logHandle: number | null;
}

let serviceReloadPromise: Promise<void> | null = null;
let resourceReloadPromise: Promise<void> | null = null;
let logReloadPromise: Promise<void> | null = null;
let logReloadKey = "";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function runtimeState(service: ServiceSummary | null | undefined) {
  if (!service) return "";
  return String(service.state || service.status || (service.running ? "running" : "stopped"));
}

function isSettledForAction(service: ServiceSummary | null | undefined, action: PendingState) {
  if (!service) return false;
  const state = runtimeState(service);
  if (action === "stopping") {
    return state === "stopped" || state === "failed" || state === "error" || (!service.running && !service.port_open);
  }
  if (action === "starting" || action === "restarting") {
    return ["ready", "running", "failed", "error", "stopped"].includes(state);
  }
  return ["ready", "running", "failed", "error", "stopped"].includes(state);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sameServiceConfigValue(left: unknown, right: unknown) {
  const normalize = (value: unknown) => (value === undefined || value === null ? "" : value);
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export const useServicesStore = defineStore("services", {
  state: (): ServicesState => ({
    services: [],
    resources: null,
    selectedId: "",
    logs: "",
    loading: false,
    resourceLoading: false,
    logLoading: false,
    error: "",
    pending: {},
    bulkPending: "",
    live: true,
    pollHandle: null,
    resourceHandle: null,
    logHandle: null,
  }),
  getters: {
    selected(state) {
      return state.services.find((item) => item.id === state.selectedId) || state.services[0] || null;
    },
  },
  actions: {
    mergeService(service: ServiceSummary | null | undefined) {
      if (!service?.id) return null;
      const index = this.services.findIndex((item) => item.id === service.id);
      if (index >= 0) {
        this.services.splice(index, 1, { ...this.services[index], ...service });
      } else {
        this.services.push(service);
      }
      if (!this.selectedId) this.selectedId = service.id;
      return this.services.find((item) => item.id === service.id) || service;
    },
    mergeServices(services: ServiceSummary[]) {
      this.services = services.map((service) => {
        const existing = this.services.find((item) => item.id === service.id);
        return existing ? { ...existing, ...service } : service;
      });
      if (!this.selectedId || !this.services.some((item) => item.id === this.selectedId)) {
        this.selectedId = this.services[0]?.id || "";
      }
    },
    applyActionResponse(result: ServiceActionResponse | null | undefined, fallbackId = "") {
      if (!result) return null;
      if (Array.isArray(result.services)) {
        this.mergeServices(result.services);
        return null;
      }
      if (result.service) {
        return this.mergeService({ ...result.service, id: result.service.id || fallbackId });
      }
      return null;
    },
    async reload(quiet = false) {
      const results = await Promise.allSettled([this.reloadServices(quiet), this.reloadResources(true)]);
      const failed = results.find((item) => item.status === "rejected");
      if (failed && !quiet) throw failed.reason;
    },
    async reloadServices(quiet = false) {
      if (serviceReloadPromise) return serviceReloadPromise;
      if (!quiet) this.loading = true;
      this.error = "";
      serviceReloadPromise = (async () => {
        try {
          const data = await loadServices();
          this.mergeServices(data.services || []);
        } catch (error) {
          this.error = errorText(error);
          throw error;
        } finally {
          if (!quiet) this.loading = false;
          serviceReloadPromise = null;
        }
      })();
      if (quiet) {
        try {
          await serviceReloadPromise;
        } catch {
          // Quiet polling should not interrupt the page.
        }
        return;
      }
      await serviceReloadPromise;
    },
    async reloadResources(quiet = false) {
      if (resourceReloadPromise) return resourceReloadPromise;
      if (!quiet) this.resourceLoading = true;
      resourceReloadPromise = (async () => {
        try {
          this.resources = await loadSystemResources();
        } finally {
          if (!quiet) this.resourceLoading = false;
          resourceReloadPromise = null;
        }
      })();
      if (quiet) {
        try {
          await resourceReloadPromise;
        } catch {
          // Resource probes are auxiliary; keep service controls usable.
        }
        return;
      }
      await resourceReloadPromise;
    },
    async refreshLogs(quiet = false) {
      const id = this.selected?.id;
      if (!id) return;
      if (logReloadPromise && logReloadKey === id) return logReloadPromise;
      if (!quiet) this.logLoading = true;
      logReloadKey = id;
      logReloadPromise = (async () => {
        try {
          const logs = await fetchServiceLogs(id);
          if (this.selected?.id === id) this.logs = logs;
        } catch (error) {
          if (this.selected?.id === id) this.logs = `日志读取失败：${errorText(error)}`;
          throw error;
        } finally {
          if (!quiet) this.logLoading = false;
          logReloadPromise = null;
          logReloadKey = "";
        }
      })();
      if (quiet) {
        try {
          await logReloadPromise;
        } catch {
          // Live log polling should not steal focus with errors.
        }
        return;
      }
      await logReloadPromise;
    },
    async select(id: string) {
      this.selectedId = id;
      await this.refreshLogs();
    },
    async start(id: string) {
      if (this.pending[id]) return;
      this.pending[id] = "starting";
      try {
        this.applyActionResponse(await startService(id), id);
        await this.refreshBurst({ id, action: "starting", rounds: 6, delayMs: 900 });
      } finally {
        this.pending[id] = "";
      }
    },
    async stop(id: string) {
      if (this.pending[id]) return;
      this.pending[id] = "stopping";
      try {
        this.applyActionResponse(await stopService(id), id);
        await this.refreshBurst({ id, action: "stopping", rounds: 3, delayMs: 650 });
      } finally {
        this.pending[id] = "";
      }
    },
    async restart(id: string) {
      if (this.pending[id]) return;
      this.pending[id] = "restarting";
      try {
        this.applyActionResponse(await stopService(id), id);
        await this.refreshBurst({ id, action: "stopping", rounds: 2, delayMs: 500 });
        this.applyActionResponse(await startService(id), id);
        await this.refreshBurst({ id, action: "restarting", rounds: 7, delayMs: 900 });
      } finally {
        this.pending[id] = "";
      }
    },
    async startAll() {
      if (this.bulkPending) return;
      this.bulkPending = "starting";
      try {
        this.applyActionResponse(await startAllServices());
        await this.refreshBurst({ action: "starting", rounds: 8, delayMs: 900 });
      } finally {
        this.bulkPending = "";
      }
    },
    async stopAll() {
      if (this.bulkPending) return;
      this.bulkPending = "stopping";
      try {
        this.applyActionResponse(await stopAllServices());
        await this.refreshBurst({ action: "stopping", rounds: 4, delayMs: 650 });
      } finally {
        this.bulkPending = "";
      }
    },
    async restartAll() {
      if (this.bulkPending) return;
      this.bulkPending = "restarting";
      try {
        this.applyActionResponse(await stopAllServices());
        await this.refreshBurst({ action: "stopping", rounds: 2, delayMs: 500 });
        this.applyActionResponse(await startAllServices());
        await this.refreshBurst({ action: "restarting", rounds: 9, delayMs: 900 });
      } finally {
        this.bulkPending = "";
      }
    },
    async clearLogs() {
      const id = this.selected?.id;
      if (!id) return;
      await clearServiceLogs(id);
      await this.refreshLogs();
    },
    async clearAllLogs() {
      await clearAllServiceLogs();
      this.logs = "";
    },
    async updateConfig(service: ServiceSummary) {
      const result = await updateServiceConfig(service.id, {
        cwd: service.cwd || "",
        health_url: service.health_url || "",
        startup_wait_sec: Number(service.startup_wait_sec || 0),
        command: service.command || "",
      });
      if (Array.isArray(result.services)) {
        this.mergeServices(result.services);
        return this.services.find((item) => item.id === service.id) || null;
      }
      const saved = this.mergeService(result.service ? { ...result.service, id: service.id } : { ...service, id: service.id });
      await this.reloadServices(true);
      const verified = this.services.find((item) => item.id === service.id) || saved;
      const command = verified?.configured_command || verified?.command || "";
      if (!sameServiceConfigValue(command, service.command || "")) {
        throw new Error("服务参数保存后校验失败：启动命令回显不一致");
      }
      if (!sameServiceConfigValue(verified?.cwd || "", service.cwd || "")) {
        throw new Error("服务参数保存后校验失败：工作目录回显不一致");
      }
      if (!sameServiceConfigValue(verified?.health_url || "", service.health_url || "")) {
        throw new Error("服务参数保存后校验失败：Health URL 回显不一致");
      }
      return verified;
    },
    async refreshBurst(options: { id?: string; action?: PendingState; rounds?: number; delayMs?: number } = {}) {
      const rounds = options.rounds ?? 4;
      const delayMs = options.delayMs ?? 850;
      const action = options.action || "";
      for (let i = 0; i < rounds; i += 1) {
        await Promise.allSettled([
          this.reloadServices(true),
          this.reloadResources(true),
          this.live ? this.refreshLogs(true) : Promise.resolve(),
        ]);
        if (options.id) {
          const item = this.services.find((service) => service.id === options.id);
          if (isSettledForAction(item, action)) break;
        }
        if (i < rounds - 1) await wait(delayMs);
      }
    },
    async trackUntilStable(id = "", action: PendingState = "") {
      await this.refreshBurst({ id, action, rounds: 12, delayMs: 750 });
    },
    startPolling() {
      this.stopPolling();
      this.pollHandle = window.setInterval(() => {
        void this.reloadServices(true);
      }, 4500);
      this.resourceHandle = window.setInterval(() => {
        void this.reloadResources(true);
      }, 6000);
      this.logHandle = window.setInterval(() => {
        if (this.live) void this.refreshLogs(true);
      }, 1600);
    },
    stopPolling() {
      if (this.pollHandle) window.clearInterval(this.pollHandle);
      if (this.resourceHandle) window.clearInterval(this.resourceHandle);
      if (this.logHandle) window.clearInterval(this.logHandle);
      this.pollHandle = null;
      this.resourceHandle = null;
      this.logHandle = null;
    },
  },
});
