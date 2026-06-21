import { resolve } from "node:path";

const DEFAULT_CONDA = "/home/me/miniconda3/bin/conda";
const DEFAULT_ENV = "qwen3-asr";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 7860;

export function createBackendLaunchContract(options = {}) {
  const root = options.root ? resolve(options.root) : resolve(process.cwd());
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const conda = options.conda || DEFAULT_CONDA;
  const env = options.env || DEFAULT_ENV;

  return {
    host,
    port,
    cwd: root,
    healthUrl: `http://${host}:${port}/api/health`,
    appUrl: `http://${host}:${port}/app/`,
    logPath: resolve(root, "runtime/desktop/backend.log"),
    startupReadyTimeoutMs: Number(options.startupReadyTimeoutMs || 45000),
    command: {
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
    },
  };
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

  if (!contract.command?.args?.includes("backend/main.py")) {
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
