import { resolve } from "node:path";

const DEFAULT_LINUX_CONDA = "/home/me/miniconda3/bin/conda";
const DEFAULT_WINDOWS_CONDA = "conda";
const DEFAULT_ENV = "qwen3-asr";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 7860;

export function createBackendLaunchContract(options = {}) {
  const root = options.root ? resolve(options.root) : resolve(process.cwd());
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const platform = options.platform || process.platform;
  const envVars = options.envVars || process.env;
  const conda =
    options.conda ||
    envVars.BRANCHWHISPER_BACKEND_CONDA ||
    defaultCondaForPlatform(platform);
  const env = options.env || envVars.BRANCHWHISPER_BACKEND_ENV || DEFAULT_ENV;
  const backendExecutable =
    options.backendExecutable || envVars.BRANCHWHISPER_BACKEND_EXECUTABLE || "";
  const command = backendExecutable
    ? {
        kind: "executable",
        program: backendExecutable,
        args: ["--host", host, "--port", String(port)],
      }
    : {
        kind: "conda",
        program: conda,
        args: [
          "run",
          "-n",
          env,
          "python",
          "backend/main.py",
          "--host",
          host,
          "--port",
          String(port),
        ],
      };

  return {
    host,
    port,
    cwd: root,
    healthUrl: `http://${host}:${port}/api/health`,
    appUrl: `http://${host}:${port}/app/`,
    logPath: resolve(root, "runtime/desktop/backend.log"),
    startupReadyTimeoutMs: Number(options.startupReadyTimeoutMs || 45000),
    command,
  };
}

function defaultCondaForPlatform(platform) {
  return platform === "win32" ? DEFAULT_WINDOWS_CONDA : DEFAULT_LINUX_CONDA;
}

export function formatCommandLine(command) {
  return [command.program, ...command.args].map(shellQuote).join(" ");
}

export function validateBackendLaunchContract(contract) {
  const errors = [];

  if (!contract.healthUrl?.endsWith("/api/health")) {
    errors.push("healthUrl must end with /api/health");
  }

  if (!contract.appUrl?.endsWith("/app/")) {
    errors.push("appUrl must end with /app/");
  }

  if (!contract.command?.program) {
    errors.push("command.program is required");
  }

  if (contract.command?.kind !== "executable" && !contract.command?.args?.includes("backend/main.py")) {
    errors.push("command.args must include backend/main.py");
  }

  return errors;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) {
    return value;
  }

  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
