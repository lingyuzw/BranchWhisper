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
  channels?: string[];
  confidence?: number;
  tags?: string[];
  scene?: string[];
  avoid?: string[];
  caption?: string;
  ocr_text?: string;
  error?: string;
  intensity?: number;
  use_count?: number;
  original_name?: string;
  file_stem?: string;
  source_hash?: string;
  duplicate?: boolean;
  created_at?: string;
  updated_at?: string;
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

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadStickerBatchOptions {
  onUploadProgress?: (progress: UploadProgress) => void;
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

export async function uploadStickerBatch(files: StickerUploadFile[], channels = "all", analyze = true, options: UploadStickerBatchOptions = {}) {
  const body = JSON.stringify({ files, channels, analyze });
  type UploadResponse = { ok: boolean; results: Array<{ ok: boolean; sticker?: Sticker; error?: string }>; stickers: Sticker[] };
  if (!options.onUploadProgress) {
    return fetchJson<UploadResponse>("/api/stickers/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }
  return new Promise<UploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/stickers/batch");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : body.length;
      const loaded = event.lengthComputable ? event.loaded : Math.min(body.length, event.loaded || 0);
      options.onUploadProgress?.({
        loaded,
        total,
        percent: total ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) : 0,
      });
    };
    xhr.onload = () => {
      let data: any = {};
      if (xhr.responseText) {
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = { detail: xhr.responseText };
        }
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data.message || data.detail || data.error || `HTTP ${xhr.status}`));
        return;
      }
      resolve(data as UploadResponse);
    };
    xhr.onerror = () => reject(new Error("素材上传网络失败"));
    xhr.ontimeout = () => reject(new Error("素材上传超时"));
    xhr.send(body);
  });
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

export async function testStickerVision(payload: { sticker_id?: string; data_url?: string }) {
  return fetchJson<Record<string, unknown>>("/api/stickers/vision-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
