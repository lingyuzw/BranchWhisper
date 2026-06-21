import { formatCommandLine } from "./backendLaunchContract.mjs";

export async function probeBackendHealth(contract, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;

  if (!fetchImpl) {
    return {
      status: "unreachable",
      detail: "fetch is not available in this runtime.",
      payload: null,
    };
  }

  try {
    const response = await fetchImpl(contract.healthUrl, { method: "GET" });
    const payload = await readJson(response);

    if (response.ok) {
      return {
        status: "ready",
        detail: "Backend health check passed.",
        payload,
      };
    }

    return {
      status: "error",
      detail: `Backend health returned HTTP ${response.status}.`,
      payload,
    };
  } catch (error) {
    return {
      status: "unreachable",
      detail: error instanceof Error ? error.message : String(error),
      payload: null,
    };
  }
}

export function createBackendStartPlan(contract) {
  return {
    action: "start",
    cwd: contract.cwd,
    command: contract.command,
    commandLine: formatCommandLine(contract.command),
    logPath: contract.logPath,
    startupReadyTimeoutMs: contract.startupReadyTimeoutMs,
    repairHints: [
      "Confirm the qwen3-asr conda environment exists.",
      "Run the command manually from the repository root and inspect the log.",
      "If the port is occupied, close the old backend or configure another port.",
    ],
  };
}

export function createDesktopBackendLauncher(contract, options = {}) {
  return {
    async ensureBackend() {
      const health = await probeBackendHealth(contract, options);

      if (health.status === "ready") {
        return {
          action: "reuse",
          appUrl: contract.appUrl,
          health,
        };
      }

      return {
        action: "start",
        appUrl: contract.appUrl,
        health,
        startPlan: createBackendStartPlan(contract),
      };
    },
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
