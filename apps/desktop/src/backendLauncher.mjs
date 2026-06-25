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
    const response = await fetchImpl(contract.capabilitiesUrl, {
      method: "GET",
      headers: { Origin: "http://tauri.localhost" },
    });
    const payload = await readJson(response);

    if (response.ok && isDesktopCapable(payload)) {
      return {
        status: "ready",
        detail: "Backend desktop capability check passed.",
        payload,
      };
    }

    return {
      status: "error",
      detail: response.ok
        ? "Backend is reachable but does not expose the required desktop API contract."
        : `Backend desktop capability check returned HTTP ${response.status}.`,
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

function isDesktopCapable(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return (
    payload?.product === "BranchWhisper" &&
    Number(payload?.desktop_api_version || 0) >= 2 &&
    features.includes("api_providers") &&
    features.includes("statistics")
  );
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
