import assert from "node:assert/strict";
import test from "node:test";

import {
  checkVisualStudioBuildTools,
  checkWebView2Runtime,
  webView2DownloadUrl,
  visualStudioBuildToolsInstallUrl,
} from "./windowsPrerequisites.mjs";

test("checkVisualStudioBuildTools skips non-windows platforms", () => {
  assert.deepEqual(
    checkVisualStudioBuildTools({ platform: "linux" }),
    { ok: true, detail: "not required on linux" },
  );
});

test("checkVisualStudioBuildTools passes when vswhere returns an installation", () => {
  const result = checkVisualStudioBuildTools({
    platform: "win32",
    run: () => ({ status: 0, stdout: "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\n" }),
  });

  assert.deepEqual(result, {
    ok: true,
    detail: "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools",
  });
});

test("checkVisualStudioBuildTools reports install guidance when missing", () => {
  const result = checkVisualStudioBuildTools({
    platform: "win32",
    run: () => ({ status: 1, stdout: "", stderr: "" }),
  });

  assert.equal(result.ok, false);
  assert.ok(result.detail.includes("Visual Studio Build Tools"));
  assert.ok(visualStudioBuildToolsInstallUrl.includes("visualstudio.microsoft.com"));
});

test("checkWebView2Runtime passes when registry has a version", () => {
  let observedCommand = "";
  const result = checkWebView2Runtime({
    platform: "win32",
    run: (_command, powerShellCommand) => {
      observedCommand = powerShellCommand;
      return { status: 0, stdout: "Microsoft Edge WebView2 Runtime 126.0.0\n" };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    detail: "Microsoft Edge WebView2 Runtime 126.0.0",
  });
  assert.ok(observedCommand.includes("WOW6432Node"));
});

test("checkWebView2Runtime reports repair guidance when missing", () => {
  const result = checkWebView2Runtime({
    platform: "win32",
    run: () => ({ status: 1, stdout: "", stderr: "" }),
  });

  assert.equal(result.ok, false);
  assert.ok(result.detail.includes("WebView2 Runtime"));
  assert.ok(webView2DownloadUrl.includes("developer.microsoft.com"));
});
