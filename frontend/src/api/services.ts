import { fetchJson } from "./client";

export interface ServiceSummary {
  id: string;
  label: string;
  description?: string;
  running?: boolean;
  status?: string;
  state?: string;
  error?: string;
  external?: boolean;
  port_open?: boolean;
  health_url?: string;
  cwd?: string;
  command?: string;
  startup_wait_sec?: number;
  startup_ready_timeout_sec?: number;
  pid?: number | string | null;
  port?: number | string | null;
  returncode?: number | string | null;
  started_at?: number | string | null;
  log_file?: string;
  health?: Record<string, any> | string | null;
  warmup?: Record<string, any> | null;
}

export interface ServicesResponse {
  services: ServiceSummary[];
  resources?: unknown;
}

export interface ServiceActionResponse {
  ok?: boolean;
  service?: ServiceSummary;
  services?: ServiceSummary[];
  message?: string;
}

export async function loadServices(): Promise<ServicesResponse> {
  return fetchJson<ServicesResponse>("/api/services");
}

export async function startService(serviceId: string): Promise<ServiceActionResponse> {
  return fetchJson<ServiceActionResponse>(`/api/services/${encodeURIComponent(serviceId)}/start`, { method: "POST" });
}

export async function stopService(serviceId: string): Promise<ServiceActionResponse> {
  return fetchJson<ServiceActionResponse>(`/api/services/${encodeURIComponent(serviceId)}/stop`, { method: "POST" });
}

export async function startAllServices(): Promise<ServiceActionResponse> {
  return fetchJson<ServiceActionResponse>("/api/services/start-all", { method: "POST" });
}

export async function stopAllServices(): Promise<ServiceActionResponse> {
  return fetchJson<ServiceActionResponse>("/api/services/stop-all", { method: "POST" });
}

export async function fetchServiceLogs(serviceId: string) {
  const data = await fetchJson<{ logs?: string }>(`/api/services/${encodeURIComponent(serviceId)}/logs?max_bytes=50000`);
  return data.logs || "";
}

export async function clearServiceLogs(serviceId: string) {
  return fetchJson(`/api/services/${encodeURIComponent(serviceId)}/logs`, { method: "DELETE" });
}

export async function clearAllServiceLogs() {
  return fetchJson("/api/services/logs", { method: "DELETE" });
}

export async function updateServiceConfig(serviceId: string, payload: Partial<ServiceSummary>): Promise<ServiceActionResponse> {
  return fetchJson<ServiceActionResponse>(`/api/services/${encodeURIComponent(serviceId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function loadSystemResources() {
  return fetchJson<Record<string, unknown>>("/api/system/resources");
}
