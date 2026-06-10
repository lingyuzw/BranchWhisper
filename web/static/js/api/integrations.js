import { state } from "../stores/state.js";
import { fetchJson } from "./client.js";

export async function loadIntegrations() {
  try {
    const data = await fetchJson("/api/integrations");
    state.integrations = data.integrations || [];
    state.integrationEnv = data.environment || null;
    if (!state.integrations.some((item) => item.id === state.selectedIntegrationId)) {
      state.selectedIntegrationId = state.integrations[0]?.id || "weixin_personal";
    }
    return { ok: true, integrations: state.integrations, environment: state.integrationEnv };
  } catch (error) {
    state.integrationEnv = null;
    return { ok: false, error, integrations: state.integrations, environment: null };
  }
}

export async function createIntegration(data) {
  return syncIntegrations(await fetchJson("/api/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }));
}

export async function updateIntegration(id, data) {
  return syncIntegrations(await fetchJson(`/api/integrations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }));
}

export async function deleteIntegration(id) {
  return syncIntegrations(await fetchJson(`/api/integrations/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function startIntegration(id) {
  return syncIntegrations(await fetchJson(`/api/integrations/${encodeURIComponent(id)}/start`, { method: "POST" }));
}

export async function stopIntegration(id) {
  return syncIntegrations(await fetchJson(`/api/integrations/${encodeURIComponent(id)}/stop`, { method: "POST" }));
}

export async function restartIntegration(id) {
  return syncIntegrations(await fetchJson(`/api/integrations/${encodeURIComponent(id)}/restart`, { method: "POST" }));
}

export async function loginIntegration(id) {
  return syncIntegrations(await fetchJson(`/api/integrations/${encodeURIComponent(id)}/login`, { method: "POST" }));
}

export async function startIntegrationQrLogin(id, force = false) {
  return syncIntegrations(await fetchJson(`/api/integrations/${encodeURIComponent(id)}/login/qr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  }));
}

export async function pollIntegrationQrLogin(id, verifyCode = "") {
  return syncIntegrations(await fetchJson(`/api/integrations/${encodeURIComponent(id)}/login/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verify_code: verifyCode }),
  }));
}

export async function installIntegration(id) {
  return syncIntegrations(await fetchJson(`/api/integrations/${encodeURIComponent(id)}/install`, { method: "POST" }));
}

export async function startIntegrationBridge(id, branchwhisperUrl = "") {
  const body = branchwhisperUrl ? { branchwhisper_url: branchwhisperUrl } : {};
  return syncIntegrations(await fetchJson(`/api/integrations/${encodeURIComponent(id)}/bridge/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

export async function fetchIntegrationLogs(id, scope = "all") {
  const data = await fetchJson(`/api/integrations/${encodeURIComponent(id)}/logs?max_bytes=64000&scope=${encodeURIComponent(scope)}`);
  return data.logs || "";
}

export async function clearIntegrationLogs(id) {
  return fetchJson(`/api/integrations/${encodeURIComponent(id)}/logs`, { method: "DELETE" });
}

export async function testIntegrationDialog(id, text) {
  return fetchJson("/api/integrations/dialog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform_id: id,
      session_id: "web_probe",
      sender_id: "integration_console",
      text,
    }),
  });
}

function syncIntegrations(data) {
  state.integrations = data.integrations || state.integrations;
  state.integrationEnv = data.environment || state.integrationEnv;
  return data;
}
