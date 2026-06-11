import { defineStore } from "pinia";
import { loadConfig, type PublicConfig } from "@/api/config";
import { loadServices, type ServiceSummary } from "@/api/services";

interface AppState {
  config: PublicConfig | null;
  services: ServiceSummary[];
  loading: boolean;
  error: string;
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
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
  },
});
