import { fetchJson } from "@/api/client";

export interface IntegrationToolStatus {
  available?: boolean;
  version?: string;
  path?: string;
}

export interface IntegrationEnvironment {
  ready?: boolean;
  tools?: Record<string, IntegrationToolStatus>;
}

export interface IntegrationItem {
  id: string;
  type?: string;
  chat_name?: string;
  enabled?: boolean;
  status?: string;
  last_error?: string;
  openclaw_profile?: string;
  bot_profile_id?: string;
  reply_mode?: string;
  voice_trigger_keywords?: string[];
  pid?: number | string;
  runtime?: Record<string, any>;
  accounts?: Array<Record<string, any>>;
  recent_timings?: Array<Record<string, any>>;
  my_weixin_session?: Record<string, any>;
}

export interface IntegrationsResponse {
  integrations: IntegrationItem[];
  environment?: IntegrationEnvironment;
  integration?: IntegrationItem;
  result?: Record<string, any>;
}

function syncResponse(data: IntegrationsResponse): IntegrationsResponse {
  return {
    ...data,
    integrations: data.integrations || [],
    environment: data.environment || {},
  };
}

export async function loadIntegrations() {
  return syncResponse(await fetchJson<IntegrationsResponse>("/api/integrations"));
}

export async function createIntegration(payload: Partial<IntegrationItem>) {
  return syncResponse(await fetchJson<IntegrationsResponse>("/api/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function updateIntegration(id: string, payload: Partial<IntegrationItem>) {
  return syncResponse(await fetchJson<IntegrationsResponse>(`/api/integrations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function deleteIntegration(id: string) {
  return syncResponse(await fetchJson<IntegrationsResponse>(`/api/integrations/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function installIntegration(id: string) {
  return syncResponse(await fetchJson<IntegrationsResponse>(`/api/integrations/${encodeURIComponent(id)}/install`, { method: "POST" }));
}

export async function startIntegration(id: string) {
  return syncResponse(await fetchJson<IntegrationsResponse>(`/api/integrations/${encodeURIComponent(id)}/start`, { method: "POST" }));
}

export async function stopIntegration(id: string) {
  return syncResponse(await fetchJson<IntegrationsResponse>(`/api/integrations/${encodeURIComponent(id)}/stop`, { method: "POST" }));
}

export async function restartIntegration(id: string) {
  return syncResponse(await fetchJson<IntegrationsResponse>(`/api/integrations/${encodeURIComponent(id)}/restart`, { method: "POST" }));
}

export async function startIntegrationQrLogin(id: string, force = true) {
  return syncResponse(await fetchJson<IntegrationsResponse>(`/api/integrations/${encodeURIComponent(id)}/login/qr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  }));
}

export async function pollIntegrationQrLogin(id: string, verifyCode = "") {
  return syncResponse(await fetchJson<IntegrationsResponse>(`/api/integrations/${encodeURIComponent(id)}/login/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verify_code: verifyCode }),
  }));
}

export async function startIntegrationBridge(id: string, branchwhisperUrl = "") {
  return syncResponse(await fetchJson<IntegrationsResponse>(`/api/integrations/${encodeURIComponent(id)}/bridge/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(branchwhisperUrl ? { branchwhisper_url: branchwhisperUrl } : {}),
  }));
}

export async function fetchIntegrationLogs(id: string, scope = "current") {
  const data = await fetchJson<{ logs?: string }>(
    `/api/integrations/${encodeURIComponent(id)}/logs?max_bytes=64000&scope=${encodeURIComponent(scope)}`,
  );
  return data.logs || "";
}

export async function clearIntegrationLogs(id: string) {
  return fetchJson<Record<string, unknown>>(`/api/integrations/${encodeURIComponent(id)}/logs`, { method: "DELETE" });
}

export async function testIntegrationDialog(id: string, text: string) {
  return fetchJson<Record<string, any>>("/api/integrations/dialog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform_id: id, session_id: "web_probe", sender_id: "integration_console", text }),
  });
}

export async function testIntegrationVoice(id: string, text: string) {
  return fetchJson<Record<string, any>>(`/api/integrations/${encodeURIComponent(id)}/voice-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function testIntegrationSticker(id: string, text: string) {
  return fetchJson<Record<string, any>>(`/api/integrations/${encodeURIComponent(id)}/sticker-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
