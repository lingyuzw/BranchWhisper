import { fetchJson } from "@/api/client";

export interface ChatAttachment {
  type: "image" | "sticker";
  asset_id?: string;
  url?: string;
  tag?: string;
  name?: string;
  mime?: string;
  summary?: string;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  source?: string;
  created_at?: string;
  attachments?: ChatAttachment[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at?: string;
  summary?: string;
  last_message?: string;
  message_count?: number;
  source?: string;
  platform_id?: string;
  sender_id?: string;
  favorite?: boolean;
  archived?: boolean;
}

export interface Conversation extends ConversationSummary {
  messages: ChatMessage[];
}

export async function loadConversations(query = "", archived = "active") {
  const params = new URLSearchParams();
  if (query.trim()) params.set("query", query.trim());
  if (archived) params.set("archived", archived);
  return fetchJson<{ conversations: ConversationSummary[] }>(`/api/conversations${params.toString() ? `?${params}` : ""}`);
}

export async function loadConversation(conversationId: string) {
  return fetchJson<{ conversation: Conversation }>(`/api/conversations/${encodeURIComponent(conversationId)}`);
}

export async function deleteConversation(conversationId: string) {
  return fetchJson<{ ok: boolean }>(`/api/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
}
