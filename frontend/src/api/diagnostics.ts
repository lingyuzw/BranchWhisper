import { ApiError, fetchJson } from "@/api/client";

export interface DiagnosticsSummary {
  ok: boolean;
  project_root: string;
  python: {
    executable: string;
    version: string;
    platform: string;
  };
  process: {
    pid: number;
    cwd: string;
  };
  files: Record<string, { path: string; exists: boolean; kind: string }>;
  commands: Record<string, { command: string; available: boolean; path: string }>;
  counts: Record<string, number>;
  issues: string[];
}

export async function loadDiagnosticsSummary() {
  return fetchJson<DiagnosticsSummary>("/api/diagnostics/summary");
}

export interface LlmApiDiagnostic {
  ok: boolean;
  url: string;
  model: string;
  status_code?: number;
  latency_ms?: number;
  error?: string;
  response?: unknown;
}

export async function runLlmApiDiagnostic() {
  return fetchJson<LlmApiDiagnostic>("/api/diagnostics/llm-api-test", { method: "POST" });
}

export interface AudioApiDiagnostic {
  ok: boolean;
  kind: "asr" | "tts";
  provider: string;
  url: string;
  model: string;
  api_key_set: boolean;
  latency_ms?: number | null;
  error?: string;
  message: string;
  response?: unknown;
  capabilities?: Record<string, unknown>;
}

export async function runAsrApiDiagnostic() {
  return fetchJson<AudioApiDiagnostic>("/api/diagnostics/asr-api-test", { method: "POST" });
}

export async function runTtsApiDiagnostic() {
  return fetchJson<AudioApiDiagnostic>("/api/diagnostics/tts-api-test", { method: "POST" });
}

export async function runTtsVoicePreview(text: string) {
  const response = await fetch("/api/diagnostics/tts-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const bodyText = await response.text();
    let payload: unknown = { detail: bodyText };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      // keep the plain text payload
    }
    const errorPayload = payload as { detail?: string; error?: string; message?: string };
    throw new ApiError(errorPayload.message || errorPayload.detail || errorPayload.error || `HTTP ${response.status}`, response.status, payload);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("audio/")) {
    throw new ApiError("TTS 试听没有返回可播放音频", response.status, { content_type: contentType });
  }
  return response.blob();
}

export interface LocalModelCheck {
  id: string;
  name: string;
  ok: boolean;
  status: string;
  latency_ms?: number | null;
  port: string;
  url: string;
  error: string;
  message: string;
  curl: string;
  detail?: unknown;
}

export interface LocalModelsDiagnostic {
  ok: boolean;
  checks: LocalModelCheck[];
}

export interface VisionApiDiagnostic {
  ok: boolean;
  url: string;
  model: string;
  api_key_set: boolean;
  status_code?: number | null;
  latency_ms?: number | null;
  error?: string;
  message: string;
  request_shape?: unknown;
  response?: unknown;
}

export async function runLocalModelsDiagnostic() {
  return fetchJson<LocalModelsDiagnostic>("/api/diagnostics/local-models");
}

export async function runVisionApiDiagnostic() {
  return fetchJson<VisionApiDiagnostic>("/api/diagnostics/vision-api-test", { method: "POST" });
}
