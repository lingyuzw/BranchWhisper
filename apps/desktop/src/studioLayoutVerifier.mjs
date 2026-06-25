#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

export const DEFAULT_STUDIO_LAYOUT_VIEWPORTS = [
  { width: 1280, height: 850 },
  { width: 1440, height: 900 },
];

export const DEFAULT_STUDIO_LAYOUT_PAGES = [
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
];

const OVERFLOW_TOLERANCE_PX = 2;

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) {
    throw new Error(`Invalid viewport "${value}". Expected WIDTHxHEIGHT, for example 1280x850.`);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

function splitList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseLayoutVerifierArgs(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  const options = {
    htmlPath: resolve(cwd, "apps/desktop/src/studio.html"),
    outputDir: join(tmpdir(), "branchwhisper-studio-layout"),
    pages: [...DEFAULT_STUDIO_LAYOUT_PAGES],
    viewports: [...DEFAULT_STUDIO_LAYOUT_VIEWPORTS],
    screenshots: true,
    json: false,
    timeoutMs: 30_000,
    browserExecutable: undefined,
  };

  const pages = [];
  const viewports = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`${arg} requires a value.`);
      }
      return argv[index];
    };

    if (arg === "--page" || arg === "--pages") {
      pages.push(...splitList(next()));
    } else if (arg === "--viewport") {
      viewports.push(parseViewport(next()));
    } else if (arg === "--output") {
      options.outputDir = next();
    } else if (arg === "--html") {
      options.htmlPath = resolve(cwd, next());
    } else if (arg === "--browser-executable") {
      options.browserExecutable = next();
    } else if (arg === "--timeout") {
      options.timeoutMs = Number(next());
      if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
        throw new Error("--timeout must be a positive number of milliseconds.");
      }
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--no-screenshots") {
      options.screenshots = false;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (pages.length > 0) {
    const unknown = pages.filter((pageName) => !DEFAULT_STUDIO_LAYOUT_PAGES.includes(pageName));
    if (unknown.length > 0) {
      throw new Error(`Unknown page(s): ${unknown.join(", ")}.`);
    }
    options.pages = pages;
  }

  if (viewports.length > 0) {
    options.viewports = viewports;
  }

  return options;
}

export function buildScreenshotPath(outputDir, pageName, viewport) {
  return join(outputDir, `${viewport.width}x${viewport.height}`, `${pageName}.png`);
}

export function workspaceTabSelector(workspaceName) {
  return `.workspace-toggle [data-workspace-tab="${workspaceName}"]`;
}

export function summarizeLayoutSnapshot(snapshot, tolerance = OVERFLOW_TOLERANCE_PX) {
  const issues = [];
  const workspaceTop = Math.round(snapshot.scroll?.workspaceTop || 0);
  const workspaceLeft = Math.round(snapshot.scroll?.workspaceLeft || 0);

  if (workspaceTop > tolerance || workspaceLeft > tolerance) {
    issues.push(`workspace starts scrolled: top ${workspaceTop}px, left ${workspaceLeft}px`);
  }

  for (const measurement of snapshot.measurements || []) {
    if (measurement.delta > tolerance) {
      issues.push(`${measurement.label} horizontal overflow: ${measurement.delta}px (${measurement.selector})`);
    }
  }

  for (const clipped of snapshot.clippedElements || []) {
    const text = clipped.text ? ` "${clipped.text}"` : "";
    issues.push(
      `element clips outside workspace: ${clipped.selector}${text} right ${Math.round(clipped.right)}px > ${Math.round(clipped.containerRight)}px`,
    );
  }

  return {
    pageName: snapshot.pageName,
    viewport: snapshot.viewport,
    screenshotPath: snapshot.screenshotPath,
    ok: issues.length === 0,
    issues,
  };
}

export function formatLayoutReport(report) {
  const total = report.results.length;
  const failed = report.results.filter((result) => !result.ok).length;
  const passed = total - failed;
  const lines = [
    report.ok
      ? `Studio layout verification passed: ${passed}/${total} passed`
      : `Studio layout verification failed: ${failed}/${total} failed`,
    `Screenshots: ${report.outputDir}`,
  ];

  for (const result of report.results) {
    const viewportLabel = `${result.viewport.width}x${result.viewport.height}`;
    const prefix = result.ok ? "PASS" : "FAIL";
    lines.push(`[${prefix}] ${viewportLabel} ${result.pageName} - ${result.screenshotPath || "screenshot disabled"}`);
    for (const issue of result.issues || []) {
      lines.push(`  - ${issue}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function resolveBrowserExecutable(env = process.env, fileExists = existsSync) {
  const explicit = env.BRANCHWHISPER_BROWSER || env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicit) {
    if (!fileExists(explicit)) {
      throw new Error(`Configured browser executable does not exist: ${explicit}`);
    }
    return explicit;
  }

  const edgeCandidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  return edgeCandidates.find((candidate) => fileExists(candidate));
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    throw new Error(
      [
        "Playwright is required for desktop layout verification.",
        "Install it with: npm install --save-dev playwright",
        "Or run from an environment that provides Playwright in NODE_PATH.",
        `Original error: ${error.message}`,
      ].join("\n"),
    );
  }
}

async function activateStudioPage(browserPage, pageName) {
  await browserPage.evaluate(() => {
    const workspace = document.querySelector(".workspace");
    if (!workspace) {
      return;
    }
    workspace.scrollTop = Math.min(120, Math.max(0, workspace.scrollHeight - workspace.clientHeight));
    workspace.scrollLeft = Math.min(40, Math.max(0, workspace.scrollWidth - workspace.clientWidth));
  });

  if (pageName === "chat") {
    await browserPage.locator(workspaceTabSelector("chat")).click();
    await browserPage.waitForSelector('.page[data-panel="chat"].active');
    return;
  }

  await browserPage.locator(workspaceTabSelector("bot")).click();
  await browserPage.locator(`[data-section="${pageName}"]`).first().click();
  await browserPage.waitForSelector(`.page[data-panel="${pageName}"].active`);
}

async function captureLayoutSnapshot(browserPage, pageName, viewport, screenshotPath) {
  const data = await browserPage.evaluate((activePageName) => {
    const tolerance = 2;

    function visible(element) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function cssPath(element) {
      if (element.id) {
        return `#${CSS.escape(element.id)}`;
      }
      const dataAttrs = ["data-panel", "data-section", "data-workspace-tab", "data-active-section"];
      for (const attr of dataAttrs) {
        const value = element.getAttribute(attr);
        if (value) {
          return `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
        }
      }
      const className = Array.from(element.classList || []).slice(0, 3).join(".");
      if (className) {
        return `${element.tagName.toLowerCase()}.${className}`;
      }
      const parent = element.parentElement;
      if (!parent) {
        return element.tagName.toLowerCase();
      }
      const siblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
      const index = siblings.indexOf(element) + 1;
      return `${parent.tagName.toLowerCase()} > ${element.tagName.toLowerCase()}:nth-of-type(${index})`;
    }

    function measure(selector, label) {
      const element = document.querySelector(selector);
      if (!element) {
        return { selector, label, clientWidth: 0, scrollWidth: 0, delta: 0, missing: true };
      }
      const clientWidth = Math.round(element.clientWidth);
      const scrollWidth = Math.round(element.scrollWidth);
      return {
        selector,
        label,
        clientWidth,
        scrollWidth,
        delta: Math.max(0, scrollWidth - clientWidth),
      };
    }

    const workspace = document.querySelector(".workspace");
    const containerRect = workspace?.getBoundingClientRect();
    const clippedElements = [];
    if (workspace && containerRect) {
      const candidates = Array.from(workspace.querySelectorAll("*")).filter(visible);
      for (const element of candidates) {
        const rect = element.getBoundingClientRect();
        if (rect.right > containerRect.right + tolerance || rect.left < containerRect.left - tolerance) {
          clippedElements.push({
            selector: cssPath(element),
            text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            containerLeft: Math.round(containerRect.left),
            containerRight: Math.round(containerRect.right),
          });
        }
      }
    }

    return {
      activePageName,
      scroll: {
        workspaceTop: workspace ? workspace.scrollTop : 0,
        workspaceLeft: workspace ? workspace.scrollLeft : 0,
      },
      measurements: [
        measure("html", "document"),
        measure("body", "body"),
        measure(".studio-shell", "studio shell"),
        measure(".workspace", "workspace"),
        measure(".content-stack", "content stack"),
        measure(".page.active", "active page"),
      ],
      clippedElements: clippedElements.slice(0, 12),
    };
  }, pageName);

  return {
    pageName,
    viewport,
    screenshotPath,
    scroll: data.scroll,
    measurements: data.measurements,
    clippedElements: data.clippedElements,
  };
}

export async function runStudioLayoutVerification(options = {}) {
  const resolved = {
    ...parseLayoutVerifierArgs([]),
    ...options,
  };
  const { chromium } = loadPlaywright();
  const browserExecutable = resolved.browserExecutable || resolveBrowserExecutable();
  const launchOptions = {
    headless: true,
  };
  if (browserExecutable) {
    launchOptions.executablePath = browserExecutable;
  }

  await mkdir(resolved.outputDir, { recursive: true });

  const browser = await chromium.launch(launchOptions);
  const results = [];

  try {
    for (const viewport of resolved.viewports) {
      const browserPage = await browser.newPage({ viewport });
      browserPage.setDefaultTimeout(resolved.timeoutMs);
      await browserPage.goto(pathToFileURL(resolved.htmlPath).href);

      for (const pageName of resolved.pages) {
        await activateStudioPage(browserPage, pageName);
        await browserPage.waitForTimeout(120);
        const screenshotPath = resolved.screenshots ? buildScreenshotPath(resolved.outputDir, pageName, viewport) : "";
        if (resolved.screenshots) {
          await mkdir(dirname(screenshotPath), { recursive: true });
          await browserPage.screenshot({ path: screenshotPath, fullPage: true });
        }
        const snapshot = await captureLayoutSnapshot(browserPage, pageName, viewport, screenshotPath);
        results.push(summarizeLayoutSnapshot(snapshot));
      }

      await browserPage.close();
    }
  } finally {
    await browser.close();
  }

  return {
    ok: results.every((result) => result.ok),
    outputDir: resolved.outputDir,
    results,
  };
}

function helpText() {
  return [
    "Usage: node apps/desktop/src/studioLayoutVerifier.mjs [options]",
    "",
    "Options:",
    "  --page guide,bot       Limit pages. Can be repeated.",
    "  --viewport 1280x850    Add a viewport. Can be repeated.",
    "  --output DIR           Screenshot output directory.",
    "  --html FILE            Studio HTML file path.",
    "  --browser-executable   Chromium or Edge executable path.",
    "  --timeout MS           Browser action timeout.",
    "  --no-screenshots       Run geometry checks without writing PNGs.",
    "  --json                 Print JSON report.",
  ].join("\n");
}

export async function runLayoutVerifierCli(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  try {
    const options = parseLayoutVerifierArgs(argv, { cwd });
    if (options.help) {
      console.log(helpText());
      return;
    }
    const report = await runStudioLayoutVerification(options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      process.stdout.write(formatLayoutReport(report));
    }
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await runLayoutVerifierCli(process.argv.slice(2));
}
