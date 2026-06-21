import { spawnSync } from "node:child_process";
import { createDesktopCommandEnv } from "./commandPath.mjs";

const supportedActions = new Set(["dev", "build"]);

export function createTauriCommandPlan(args = process.argv.slice(2), options = {}) {
  const [action, ...rest] = args;

  if (!supportedActions.has(action)) {
    throw new Error(`Unsupported Tauri action: ${action || "(missing)"}`);
  }

  return {
    command: "npx",
    args: ["--no-install", "tauri", action, ...rest],
    options: {
      stdio: "inherit",
      shell: (options.platform || process.platform) === "win32",
      env: createDesktopCommandEnv(options),
    },
  };
}

export function runTauriCommand(args = process.argv.slice(2), options = {}) {
  const plan = createTauriCommandPlan(args, options);
  const result = spawnSync(plan.command, plan.args, plan.options);

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(runTauriCommand());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
