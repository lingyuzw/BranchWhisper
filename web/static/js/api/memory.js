import { state } from "../stores/state.js";
import { fetchJson } from "./client.js";

export async function loadMemory(limit = 12, query = "", layer = "") {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query) params.set("query", query);
  if (layer) params.set("layer", layer);
  const data = await fetchJson(`/api/memory?${params.toString()}`);
  state.memories = data.items || [];
  return state.memories;
}

export async function addMemory(value) {
  return fetchJson("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value, layer: "mid" }),
  });
}

export async function deleteMemory(id) {
  return fetchJson(`/api/memory/${encodeURIComponent(id)}`, { method: "DELETE" });
}
