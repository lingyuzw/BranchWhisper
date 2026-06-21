import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export const visualStudioBuildToolsInstallUrl = "https://visualstudio.microsoft.com/downloads/";
export const webView2DownloadUrl = "https://developer.microsoft.com/microsoft-edge/webview2/";

export function checkVisualStudioBuildTools(options = {}) {
  const platform = options.platform || process.platform;

  if (platform !== "win32") {
    return { ok: true, detail: `not required on ${platform}` };
  }

  const result = runVsWhere(options);
  const detail = (result.stdout || "").trim();

  if (result.status === 0 && detail) {
    return { ok: true, detail };
  }

  return {
    ok: false,
    detail: "Visual Studio Build Tools with the C++ workload were not found.",
  };
}

export function checkWebView2Runtime(options = {}) {
  const platform = options.platform || process.platform;

  if (platform !== "win32") {
    return { ok: true, detail: `not required on ${platform}` };
  }

  const result = runPowerShell(options, [
    "$paths = @(",
    "  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\*',",
    "  'HKLM:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\*',",
    "  'HKCU:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\*'",
    ");",
    "$items = Get-ItemProperty $paths -ErrorAction SilentlyContinue |",
    "  Where-Object { $_.name -like '*WebView2*' -or $_.name -like '*Edge WebView*' } |",
    "  Select-Object -First 1;",
    "if ($items) { Write-Output (($items.name + ' ' + $items.pv).Trim()); exit 0 }",
    "exit 1",
  ].join(" "));
  const detail = (result.stdout || "").trim();

  if (result.status === 0 && detail) {
    return { ok: true, detail };
  }

  return {
    ok: false,
    detail: "Microsoft Edge WebView2 Runtime was not found.",
  };
}

function runVsWhere(options) {
  if (options.run) {
    return options.run("vswhere");
  }

  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const vswherePath = join(
    programFilesX86,
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );

  if (!existsSync(vswherePath)) {
    return { status: 1, stdout: "", stderr: "vswhere.exe not found" };
  }

  return spawnSync(
    vswherePath,
    [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property",
      "installationPath",
    ],
    { encoding: "utf8" },
  );
}

function runPowerShell(options, command) {
  if (options.run) {
    return options.run("powershell", command);
  }

  return spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { encoding: "utf8" },
  );
}
