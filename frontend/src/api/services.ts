import { fetchJson } from "./client";

export interface ServiceSummary {
  id: string;
  label: string;
  description?: string;
  running?: boolean;
  status?: string;
  health_url?: string;
}

export interface ServicesResponse {
  services: ServiceSummary[];
  resources?: unknown;
}

export async function loadServices(): Promise<ServicesResponse> {
  return fetchJson<ServicesResponse>("/api/services");
}
