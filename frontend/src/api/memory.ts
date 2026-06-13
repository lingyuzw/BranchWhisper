import { fetchJson } from "@/api/client";

export type MemoryLayer = "" | "short" | "mid" | "long";

export interface MemoryItem {
  id: string;
  key?: string;
  value: string;
  layer?: "short" | "mid" | "long";
  count?: number;
  confidence?: number;
  importance?: number;
  mode?: string;
  memory_type?: string;
  source?: string;
  last_seen_at?: string | number;
  last_changed_at?: string | number;
  created_at?: string | number;
}

export interface MemoryAdmissionResult {
  candidate: Record<string, unknown>;
  admitted: boolean;
  reason: string;
  memory?: Record<string, unknown>;
}

export async function loadMemory(limit = 240, query = "", layer: MemoryLayer = "", mode = "") {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query.trim()) params.set("query", query.trim());
  if (layer) params.set("layer", layer);
  if (mode) params.set("mode", mode);
  return fetchJson<{ items: MemoryItem[]; db_path: string; mode: string }>(`/api/memory?${params.toString()}`);
}

export async function addMemory(value: string, mode = "", layer: MemoryLayer = "mid") {
  return fetchJson<{ item: MemoryItem }>("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value, layer, mode }),
  });
}

export async function updateMemory(memoryId: string, patch: Partial<MemoryItem>) {
  return fetchJson<{ item: MemoryItem }>(`/api/memory/${encodeURIComponent(memoryId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteMemory(memoryId: string) {
  return fetchJson<{ ok: boolean }>(`/api/memory/${encodeURIComponent(memoryId)}`, { method: "DELETE" });
}

export async function runMemoryDecay(mode = "") {
  return fetchJson<Record<string, unknown>>("/api/memory/decay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

export async function testMemoryAdmission(text: string) {
  return fetchJson<{ ok: boolean; text: string; count: number; results: MemoryAdmissionResult[] }>("/api/memory/admission-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
