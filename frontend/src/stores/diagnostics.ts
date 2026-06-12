import { defineStore } from "pinia";

export type CheckStatus = "idle" | "running" | "passed" | "warning" | "failed";

export interface DiagnosticResult {
  status: CheckStatus;
  message: string;
  detail?: string;
  rawLog?: string;
  durationMs?: number;
  updatedAt?: string;
}

interface DiagnosticsState {
  results: Record<string, DiagnosticResult>;
  runningAll: boolean;
  reportMessage: string;
}

const STORAGE_KEY = "branchwhisper:diagnostics-results";

function readStoredResults(): Record<string, DiagnosticResult> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredResults(results: Record<string, DiagnosticResult>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  } catch {
    // Session storage is best-effort. The in-memory Pinia state still works.
  }
}

export const useDiagnosticsStore = defineStore("diagnostics", {
  state: (): DiagnosticsState => ({
    results: readStoredResults(),
    runningAll: false,
    reportMessage: "",
  }),
  actions: {
    resultFor(id: string): DiagnosticResult {
      return this.results[id] || { status: "idle", message: "未检测" };
    },
    setResult(id: string, result: DiagnosticResult) {
      this.results = { ...this.results, [id]: result };
      writeStoredResults(this.results);
    },
    setReportMessage(message: string, timeoutMs = 1800) {
      this.reportMessage = message;
      if (timeoutMs > 0) {
        window.setTimeout(() => {
          if (this.reportMessage === message) this.reportMessage = "";
        }, timeoutMs);
      }
    },
    clear() {
      this.results = {};
      writeStoredResults(this.results);
    },
  },
});
