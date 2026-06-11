import { state } from "../stores/state.js";
import { fetchJson } from "./client.js";

export async function loadConversations() {
  const params = new URLSearchParams();
  if (state.conversationFilter) params.set("query", state.conversationFilter);
  if (state.conversationArchivedMode) params.set("archived", state.conversationArchivedMode);
  const data = await fetchJson(`/api/conversations${params.toString() ? `?${params}` : ""}`);
  state.conversations = data.conversations || [];
  return state.conversations;
}

export async function createConversation() {
  const data = await fetchJson("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return data.conversation;
}

export async function loadConversation(conversationId) {
  if (!conversationId) return null;
  const data = await fetchJson(`/api/conversations/${encodeURIComponent(conversationId)}`);
  return data.conversation || null;
}

export async function deleteConversation(conversationId) {
  return fetchJson(`/api/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
}

export async function updateConversation(conversationId, data) {
  const result = await fetchJson(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  state.conversations = result.conversations || state.conversations;
  return result.conversation;
}

export function conversationExportUrl(conversationId) {
  return `/api/conversations/${encodeURIComponent(conversationId)}/export.md`;
}
