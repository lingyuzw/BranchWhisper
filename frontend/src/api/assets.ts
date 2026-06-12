import { fetchJson } from "@/api/client";
import type { ChatAttachment } from "@/api/conversations";

export interface Sticker {
  id: string;
  name: string;
  tag?: string;
  emotion?: string;
  url?: string;
  thumbnail?: string;
  mime?: string;
  enabled?: boolean;
  review_status?: string;
  tags?: string[];
  scene?: string[];
  avoid?: string[];
  caption?: string;
  ocr_text?: string;
  error?: string;
  intensity?: number;
  use_count?: number;
}

export interface StickerFilters {
  status?: string;
  emotion?: string;
  q?: string;
}

export interface StickerUploadFile {
  name: string;
  data_url: string;
}

export interface StickerBulkPayload {
  action: "reanalyze" | "approve" | "delete";
  ids?: string[];
  include_filtered?: boolean;
  filters?: StickerFilters;
}

function query(filters: StickerFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) params.set(key, String(value));
  });
  return params.toString();
}

export async function loadStickers(filters: StickerFilters = {}) {
  const qs = query(filters);
  return fetchJson<{ stickers: Sticker[] }>(`/api/stickers${qs ? `?${qs}` : ""}`);
}

export async function uploadStickerBatch(files: StickerUploadFile[], channels = "all") {
  return fetchJson<{ ok: boolean; results: Array<{ ok: boolean; sticker?: Sticker; error?: string }>; stickers: Sticker[] }>(
    "/api/stickers/batch",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files, channels, analyze: false }),
    },
  );
}

export async function reanalyzeSticker(stickerId: string) {
  return fetchJson<{ sticker: Sticker; stickers: Sticker[] }>(`/api/stickers/${encodeURIComponent(stickerId)}/reanalyze`, {
    method: "POST",
  });
}

export async function approveSticker(stickerId: string) {
  return fetchJson<{ sticker: Sticker; stickers: Sticker[] }>(`/api/stickers/${encodeURIComponent(stickerId)}/approve`, {
    method: "POST",
  });
}

export async function deleteSticker(stickerId: string) {
  return fetchJson<{ ok: boolean; stickers: Sticker[] }>(`/api/stickers/${encodeURIComponent(stickerId)}`, {
    method: "DELETE",
  });
}

export async function bulkStickerAction(payload: StickerBulkPayload) {
  return fetchJson<{
    ok: boolean;
    action: string;
    count: number;
    success: number;
    failed: number;
    results: Array<{ ok: boolean; id?: string; sticker?: Sticker; error?: string }>;
    stickers: Sticker[];
  }>("/api/stickers/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateSticker(stickerId: string, patch: Partial<Sticker>) {
  return fetchJson<{ sticker: Sticker; stickers: Sticker[] }>(`/api/stickers/${encodeURIComponent(stickerId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function testSticker(text: string, channel = "web", replyText = "") {
  return fetchJson<{ intent: Record<string, unknown>; sticker: Sticker | null; matched_fields?: string[]; stickers_count: number }>(
    "/api/stickers/test",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, channel, reply_text: replyText }),
    },
  );
}

export async function uploadChatImage(dataUrl: string) {
  return fetchJson<{ asset: ChatAttachment }>("/api/assets/chat-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data_url: dataUrl }),
  });
}

export async function uploadAvatar(dataUrl: string) {
  return fetchJson<{ asset: { url?: string; path?: string; mime?: string } }>("/api/assets/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data_url: dataUrl }),
  });
}
