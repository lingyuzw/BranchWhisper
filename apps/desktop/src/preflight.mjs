import { accessSync, constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const desktopRoot = resolve(root, "apps/desktop");
const checks = [];

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
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} exited ${result.status}`).trim());
  }

  return (result.stdout || result.stderr || "").split(/\r?\n/)[0].trim();
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
check("node", () => commandVersion("node"), "Install Node.js and make it available on PATH.");
check("npm", () => commandVersion("npm"), "Install npm and make it available on PATH.");
check("cargo", () => commandVersion("cargo"), "Install Rust/Cargo before running the Tauri shell.");
check(
  "tauri cli",
  () => commandVersion("npx", ["--no-install", "tauri", "--version"], { cwd: desktopRoot }),
  "Install Tauri CLI or run npm install in apps/desktop after scaffold.",
);

const ok = checks.every((item) => item.ok);
console.log(JSON.stringify({ ok, checks }, null, 2));
process.exit(ok ? 0 : 1);
