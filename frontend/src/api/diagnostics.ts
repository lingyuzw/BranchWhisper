import { fetchJson } from "@/api/client";

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
