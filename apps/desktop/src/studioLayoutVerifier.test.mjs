import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  DEFAULT_STUDIO_LAYOUT_PAGES,
  DEFAULT_STUDIO_LAYOUT_VIEWPORTS,
  buildScreenshotPath,
  formatLayoutReport,
  parseLayoutVerifierArgs,
  summarizeLayoutSnapshot,
  workspaceTabSelector,
} from "./studioLayoutVerifier.mjs";

test("root package exposes the desktop layout verification command", async () => {
  const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8"));
  const verifyScript = packageJson.scripts["desktop:verify-layout"];
  const testScript = packageJson.scripts["desktop:test"];

  assert.match(verifyScript, /process\.env\.INIT_CWD/);
  assert.match(verifyScript, /require\('node:path'\)/);
  assert.match(verifyScript, /path\.resolve\(cwd,\s*'apps\/desktop\/src\/studioLayoutVerifier\.mjs'\)/);
  assert.match(verifyScript, /runLayoutVerifierCli\(process\.argv\.slice\(1\),\s*\{\s*cwd\s*\}\)/);
  assert.match(verifyScript, /"\s+--$/);

  assert.match(testScript, /process\.env\.INIT_CWD/);
  assert.match(testScript, /desktopTestRunner\.mjs/);
  assert.match(testScript, /path\.resolve\(cwd,\s*'apps\/desktop\/src\/desktopTestRunner\.mjs'\)/);
  assert.match(testScript, /runDesktopTestsCli\(\{\s*cwd\s*\}\)/);
  assert.doesNotMatch(testScript, /\*\.test\.mjs/);
  assert.match(packageJson.devDependencies.playwright, /^\^1\./);
});

test("studio layout verifier defaults cover every desktop page plus chat", () => {
  assert.deepEqual(DEFAULT_STUDIO_LAYOUT_VIEWPORTS, [
    { width: 1280, height: 850 },
    { width: 1440, height: 900 },
  ]);

  assert.deepEqual(DEFAULT_STUDIO_LAYOUT_PAGES, [
    "guide",
    "api",
    "bot",
    "config",
    "conversations",
    "assets",
    "rules",
    "tasks",
    "statistics",
    "logs",
    "diagnostics",
    "settings",
    "chat",
  ]);
});

test("parseLayoutVerifierArgs supports page viewport screenshot and report controls", () => {
  const options = parseLayoutVerifierArgs([
    "--page",
    "bot,chat",
    "--viewport",
    "1280x850",
    "--viewport",
    "1440x900",
    "--output",
    "C:\\Temp\\branchwhisper-shots",
    "--html",
    "apps/desktop/src/studio.html",
    "--json",
    "--no-screenshots",
  ]);

  assert.deepEqual(options.pages, ["bot", "chat"]);
  assert.deepEqual(options.viewports, [
    { width: 1280, height: 850 },
    { width: 1440, height: 900 },
  ]);
  assert.equal(options.outputDir, "C:\\Temp\\branchwhisper-shots");
  assert.equal(options.htmlPath, resolve("apps/desktop/src/studio.html"));
  assert.equal(options.json, true);
  assert.equal(options.screenshots, false);
});

test("parseLayoutVerifierArgs resolves default and relative html paths from an explicit repo root", () => {
  const repoRoot = resolve("C:\\Workspace\\BranchWhisper");

  assert.equal(
    parseLayoutVerifierArgs([], { cwd: repoRoot }).htmlPath,
    resolve(repoRoot, "apps/desktop/src/studio.html"),
  );

  assert.equal(
    parseLayoutVerifierArgs(["--html", "custom/studio.html"], { cwd: repoRoot }).htmlPath,
    resolve(repoRoot, "custom/studio.html"),
  );
});

test("parseLayoutVerifierArgs uses a temp screenshot directory by default", () => {
  const options = parseLayoutVerifierArgs([]);

  assert.equal(options.htmlPath, resolve("apps/desktop/src/studio.html"));
  assert.equal(options.screenshots, true);
  assert.equal(options.json, false);
  assert.deepEqual(options.pages, DEFAULT_STUDIO_LAYOUT_PAGES);
  assert.deepEqual(options.viewports, DEFAULT_STUDIO_LAYOUT_VIEWPORTS);
  assert.match(options.outputDir, new RegExp(`^${tmpdir().replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}`));
  assert.match(options.outputDir, /branchwhisper-studio-layout/);
});

test("buildScreenshotPath makes stable filenames for every page and viewport", () => {
  assert.equal(
    buildScreenshotPath(join("C:\\Temp", "branchwhisper"), "bot", { width: 1280, height: 850 }),
    join("C:\\Temp", "branchwhisper", "1280x850", "bot.png"),
  );

  assert.equal(
    buildScreenshotPath(join("C:\\Temp", "branchwhisper"), "chat", { width: 1440, height: 900 }),
    join("C:\\Temp", "branchwhisper", "1440x900", "chat.png"),
  );
});

test("workspace tab selectors target only the top workspace switcher", () => {
  assert.equal(workspaceTabSelector("chat"), '.workspace-toggle [data-workspace-tab="chat"]');
  assert.equal(workspaceTabSelector("bot"), '.workspace-toggle [data-workspace-tab="bot"]');
});

test("summarizeLayoutSnapshot fails only when measured overflow exceeds tolerance", () => {
  const ok = summarizeLayoutSnapshot({
    pageName: "bot",
    viewport: { width: 1280, height: 850 },
    screenshotPath: "C:\\Temp\\bot.png",
    measurements: [
      { selector: ".workspace", label: "workspace", clientWidth: 1000, scrollWidth: 1001, delta: 1 },
      { selector: ".page.active", label: "active page", clientWidth: 980, scrollWidth: 980, delta: 0 },
    ],
    clippedElements: [],
  });

  assert.equal(ok.ok, true);
  assert.deepEqual(ok.issues, []);

  const failed = summarizeLayoutSnapshot({
    pageName: "bot",
    viewport: { width: 1280, height: 850 },
    screenshotPath: "C:\\Temp\\bot.png",
    measurements: [
      { selector: ".workspace", label: "workspace", clientWidth: 1000, scrollWidth: 1040, delta: 40 },
      { selector: ".page.active", label: "active page", clientWidth: 980, scrollWidth: 1008, delta: 28 },
    ],
    clippedElements: [
      {
        selector: ".bridge-operational-grid > div:nth-child(2)",
        text: "测试表情包回复",
        left: 1020,
        right: 1312,
        containerRight: 1264,
      },
    ],
  });

  assert.equal(failed.ok, false);
  assert.deepEqual(failed.issues, [
    "workspace horizontal overflow: 40px (.workspace)",
    "active page horizontal overflow: 28px (.page.active)",
    "element clips outside workspace: .bridge-operational-grid > div:nth-child(2) \"测试表情包回复\" right 1312px > 1264px",
  ]);
});

test("formatLayoutReport gives a compact human-readable pass/fail summary", () => {
  const report = formatLayoutReport({
    ok: false,
    outputDir: "C:\\Temp\\branchwhisper-studio-layout",
    results: [
      {
        pageName: "guide",
        viewport: { width: 1280, height: 850 },
        screenshotPath: "C:\\Temp\\branchwhisper-studio-layout\\1280x850\\guide.png",
        ok: true,
        issues: [],
      },
      {
        pageName: "bot",
        viewport: { width: 1280, height: 850 },
        screenshotPath: "C:\\Temp\\branchwhisper-studio-layout\\1280x850\\bot.png",
        ok: false,
        issues: ["workspace horizontal overflow: 40px (.workspace)"],
      },
    ],
  });

  assert.match(report, /Studio layout verification failed: 1\/2 failed/);
  assert.match(report, /Screenshots: C:\\Temp\\branchwhisper-studio-layout/);
  assert.match(report, /1280x850 bot/);
  assert.match(report, /workspace horizontal overflow: 40px/);
  assert.match(report, /1280x850 guide/);
});
