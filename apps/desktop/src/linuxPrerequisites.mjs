import { spawnSync } from "node:child_process";

export const tauriUbuntuPackages = [
  "build-essential",
  "curl",
  "file",
  "libayatana-appindicator3-dev",
  "librsvg2-dev",
  "libssl-dev",
  "libwebkit2gtk-4.1-dev",
  "libxdo-dev",
];

export function checkLinuxDesktopDependencies(options = {}) {
  const platform = options.platform || process.platform;

  if (platform !== "linux") {
    return { ok: true, detail: `not required on ${platform}`, missing: [] };
  }

  const isPackageInstalled = options.isPackageInstalled || isDebianPackageInstalled;
  const missing = tauriUbuntuPackages.filter((name) => !isPackageInstalled(name));

  if (missing.length === 0) {
    return {
      ok: true,
      detail: "all Tauri Linux system packages are installed",
      missing,
    };
  }

  return {
    ok: false,
    detail: `missing packages: ${missing.join(", ")}`,
    missing,
  };
}

export function tauriUbuntuInstallCommand(packages = tauriUbuntuPackages) {
  return `sudo apt update && sudo apt install -y ${packages.join(" ")}`;
}

function isDebianPackageInstalled(name) {
  const result = spawnSync("dpkg-query", ["-W", "-f=${Status}", name], {
    encoding: "utf8",
  });

  return result.status === 0 && result.stdout.includes("install ok installed");
}
