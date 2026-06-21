import { accessSync, constants, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createBackendLaunchContract, validateBackendLaunchContract } from "./backendLaunchContract.mjs";
import { createDesktopCommandEnv } from "./commandPath.mjs";
import { checkLinuxDesktopDependencies, tauriUbuntuInstallCommand } from "./linuxPrerequisites.mjs";
import { formatPreflightReport, parsePreflightArgs } from "./preflightReport.mjs";
import {
  checkVisualStudioBuildTools,
  checkWebView2Runtime,
  visualStudioBuildToolsInstallUrl,
  webView2DownloadUrl,
} from "./windowsPrerequisites.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const desktopRoot = resolve(root, "apps/desktop");
const checks = [];
const options = parsePreflightArgs(process.argv.slice(2));

function check(name, fn, fix) {
  try {
    const detail = fn();
    checks.push({ name, ok: true, detail: detail || "ok", fix: "" });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      fix,
    });
  }
}

function canRead(path) {
  accessSync(path, constants.R_OK);
  return path;
}

function commandVersion(command, args = ["--version"], options = {}) {
  const commandOptions = {
    encoding: "utf8",
    env: createDesktopCommandEnv(),
    ...options,
  };
  const result =
    process.platform === "win32"
      ? runWindowsCommand(command, args, commandOptions)
      : spawnSync(command, args, commandOptions);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} exited ${result.status}`).trim());
  }

  return (result.stdout || result.stderr || "").split(/\r?\n/)[0].trim();
}

function runWindowsCommand(command, args, options) {
  const cwd = options.cwd || process.cwd();
  const quotedCommand = [command, ...args].map(quotePowerShellArg).join(" ");
  const script = [
    `$exitCode = 1`,
    `Push-Location ${quotePowerShellArg(cwd)}`,
    `try {`,
    `  & ${quotedCommand}`,
    `  $exitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }`,
    `} finally {`,
    `  Pop-Location`,
    `}`,
    `exit $exitCode`,
  ].join("; ");

  return spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      encoding: options.encoding,
      env: options.env,
    },
  );
}

function quotePowerShellArg(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

check(
  "frontend dist",
  () => canRead(resolve(root, "frontend/dist/index.html")),
  "Run: cd frontend && npm run build",
);
check(
  "backend entry",
  () => canRead(resolve(root, "backend/main.py")),
  "Restore backend/main.py or run from the repository root.",
);
check(
  "backend launch contract",
  () => {
    const errors = validateBackendLaunchContract(createBackendLaunchContract({ root }));
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
    return "health=/api/health app=/app/";
  },
  "Fix apps/desktop/src/backendLaunchContract.mjs before launching the desktop shell.",
);
check("node", () => commandVersion("node"), "Install Node.js and make it available on PATH.");
check("npm", () => commandVersion("npm"), "Install npm and make it available on PATH.");
check("cargo", () => commandVersion("cargo"), "Install Rust/Cargo before running the Tauri shell.");
check(
  "tauri linux packages",
  () => {
    const result = checkLinuxDesktopDependencies();
    if (!result.ok) {
      throw new Error(result.detail);
    }
    return result.detail;
  },
  `Install Tauri Linux prerequisites: ${tauriUbuntuInstallCommand()}`,
);
if (process.platform === "win32") {
  check(
    "visual studio build tools",
    () => {
      const result = checkVisualStudioBuildTools();
      if (!result.ok) {
        throw new Error(result.detail);
      }
      return result.detail;
    },
    `Install Visual Studio Build Tools with the C++ workload: ${visualStudioBuildToolsInstallUrl}`,
  );
  check(
    "webview2 runtime",
    () => {
      const result = checkWebView2Runtime();
      if (!result.ok) {
        throw new Error(result.detail);
      }
      return result.detail;
    },
    `Install Microsoft Edge WebView2 Runtime: ${webView2DownloadUrl}`,
  );
}
check(
  "tauri cli",
  () => commandVersion("npx", ["--no-install", "tauri", "--version"], { cwd: desktopRoot }),
  "Install Tauri CLI or run npm install in apps/desktop after scaffold.",
);

const ok = checks.every((item) => item.ok);
const report = { ok, checks };
const output = formatPreflightReport(report, options.format);

if (options.output) {
  writeFileSync(resolve(root, options.output), `${output}\n`, "utf8");
}

console.log(output);
process.exit(ok ? 0 : 1);
