#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function parseWslUncPath(value) {
  const normalized = String(value || "").replace(/\//g, "\\");
  const match = /^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)\\(.+)$/i.exec(normalized);
  if (!match) {
    return null;
  }
  return {
    distro: match[1],
    linuxPath: `/${match[2].replace(/\\/g, "/")}`,
  };
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function defaultListTestFiles(testDir) {
  return readdirSync(testDir)
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => resolve(testDir, name));
}

export function createDesktopTestCommand({
  cwd,
  platform = process.platform,
  execPath = process.execPath,
  listTestFiles = defaultListTestFiles,
} = {}) {
  const repoRoot = cwd || process.cwd();
  const wslPath = platform === "win32" ? parseWslUncPath(repoRoot) : null;
  if (wslPath) {
    return {
      command: "wsl",
      args: [
        "-d",
        wslPath.distro,
        "--",
        "bash",
        "-lc",
        `cd ${shellQuote(wslPath.linuxPath)} && node --test apps/desktop/src/*.test.mjs`,
      ],
    };
  }

  const testDir = resolve(repoRoot, "apps/desktop/src");
  const testFiles = listTestFiles(testDir);
  if (testFiles.length === 0) {
    throw new Error(`No desktop tests found in ${testDir}`);
  }
  return {
    command: execPath,
    args: ["--test", ...testFiles],
  };
}

export function runDesktopTestsCli({ cwd = process.cwd() } = {}) {
  const command = createDesktopTestCommand({ cwd });
  const result = spawnSync(command.command, command.args, { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
    return result;
  }
  process.exitCode = result.status ?? 1;
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runDesktopTestsCli();
}
