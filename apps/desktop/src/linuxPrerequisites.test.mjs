import assert from "node:assert/strict";
import test from "node:test";

import {
  checkLinuxDesktopDependencies,
  tauriUbuntuPackages,
} from "./linuxPrerequisites.mjs";

test("tauriUbuntuPackages includes WebKitGTK 4.1 and build tooling", () => {
  assert.ok(tauriUbuntuPackages.includes("libwebkit2gtk-4.1-dev"));
  assert.ok(tauriUbuntuPackages.includes("build-essential"));
  assert.ok(tauriUbuntuPackages.includes("libxdo-dev"));
});

test("checkLinuxDesktopDependencies skips non-linux platforms", () => {
  assert.deepEqual(
    checkLinuxDesktopDependencies({
      platform: "win32",
      isPackageInstalled: () => false,
    }),
    { ok: true, detail: "not required on win32", missing: [] },
  );
});

test("checkLinuxDesktopDependencies reports missing ubuntu packages", () => {
  const result = checkLinuxDesktopDependencies({
    platform: "linux",
    isPackageInstalled: (name) => name === "curl" || name === "file",
  });

  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("libwebkit2gtk-4.1-dev"));
  assert.ok(result.detail.includes("libwebkit2gtk-4.1-dev"));
  assert.ok(!result.missing.includes("curl"));
});

test("checkLinuxDesktopDependencies passes when every package is installed", () => {
  assert.deepEqual(
    checkLinuxDesktopDependencies({
      platform: "linux",
      isPackageInstalled: () => true,
    }),
    {
      ok: true,
      detail: "all Tauri Linux system packages are installed",
      missing: [],
    },
  );
});
