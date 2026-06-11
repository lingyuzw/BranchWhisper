import { state } from "../stores/state.js";
import { fetchJson } from "./client.js";

export async function loadServices() {
  try {
    const data = await fetchJson("/api/services");
    state.previewMode = false;
    state.services = data.services || [];
    return { ok: true, services: state.services };
  } catch {
    state.previewMode = true;
    return { ok: false, services: state.services };
  }
}

export async function loadSystemResources() {
  try {
    const data = await fetchJson("/api/system/resources");
    state.systemResources = data;
    return { ok: true, resources: data };
  } catch {
    state.systemResources = null;
    return { ok: false, resources: null };
  }
}

export async function startService(serviceId) {
  return fetchJson(`/api/services/${serviceId}/start`, { method: "POST" });
}

export async function stopService(serviceId) {
  return fetchJson(`/api/services/${serviceId}/stop`, { method: "POST" });
}

export async function startAllServices() {
  return fetchJson("/api/services/start-all", { method: "POST" });
}

export async function stopAllServices() {
  return fetchJson("/api/services/stop-all", { method: "POST" });
}

export async function updateServiceConfig(serviceId, data) {
  return fetchJson(`/api/services/${serviceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function fetchServiceLogs(serviceId) {
  const data = await fetchJson(`/api/services/${serviceId}/logs?max_bytes=36000`);
  return data.logs || "";
}

export async function clearServiceLogs(serviceId) {
  return fetchJson(`/api/services/${encodeURIComponent(serviceId)}/logs`, { method: "DELETE" });
}

export async function clearAllServiceLogs() {
  return fetchJson("/api/services/logs", { method: "DELETE" });
}
