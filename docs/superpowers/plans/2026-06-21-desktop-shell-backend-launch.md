# Desktop Shell Backend Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first desktop-shell foundation so BranchWhisper can open as an app, find or start the lightweight backend, and load `/app/` without requiring local AI services.

**Architecture:** Keep FastAPI as the business boundary and Vue as the app UI. Add a focused desktop shell under `apps/desktop/` that owns only window lifecycle, backend discovery/startup, log capture, and startup failure guidance. The first implementation should prove the startup contract with tests and configuration before packaging heavy installers.

**Tech Stack:** Tauri preferred after dependency verification, Rust for shell commands if Tauri is available, Node scripts for preflight checks, existing FastAPI backend and built Vue frontend.

---

## File Map

- Create: `docs/superpowers/plans/2026-06-21-desktop-shell-backend-launch.md`
  - This implementation plan.
- Create: `apps/desktop/package.json`
  - Desktop shell npm scripts and dependency declarations.
- Create: `apps/desktop/src-tauri/tauri.conf.json`
  - Tauri app metadata, window config, and dev URL.
- Create: `apps/desktop/src-tauri/Cargo.toml`
  - Rust package metadata and Tauri dependencies.
- Create: `apps/desktop/src-tauri/src/main.rs`
  - Minimal app lifecycle and backend startup commands.
- Create: `apps/desktop/src/preflight.mjs`
  - Node preflight script that checks backend command, port, frontend dist, and Tauri tool availability.
- Create: `apps/desktop/src/startup.html`
  - Startup/failure screen shown before backend `/app/` is ready.
- Modify: `package.json`
  - Add root scripts for desktop preflight and dev if root package remains the orchestration surface.
- Modify: `docs/development/desktop-application-optimization-runbook.md`
  - Record Phase 4 execution details, verification commands, and failure handling.
- Optional modify: `.gitignore`
  - Ignore desktop generated build artifacts only if needed.

## Phase Boundary

This phase does **not** package a final Windows installer and does **not** install local Qwen3/CosyVoice/llama.cpp environments.

It completes when:

- The repo has a desktop shell skeleton.
- A preflight command can explain whether Tauri is available.
- The shell startup contract is documented and testable.
- The shell can be run in dev on machines with Tauri prerequisites.
- Backend launch failure has a visible, copyable repair path.

If Tauri prerequisites are missing on the current machine, this phase still commits the scaffold and preflight result, then Phase 7 handles packaging prerequisites.

## Task 1: Add Failing Desktop Preflight Contract

**Files:**
- Create: `apps/desktop/src/preflight.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add a root script expectation**

Update root `package.json` to include:

```json
{
  "scripts": {
    "desktop:preflight": "node apps/desktop/src/preflight.mjs"
  }
}
```

If root `package.json` already has only dependencies, keep those dependencies and add `scripts` beside them.

- [ ] **Step 2: Write the failing preflight placeholder test by command**

Run:

```bash
npm run desktop:preflight
```

Expected RED:

```text
Cannot find module '.../apps/desktop/src/preflight.mjs'
```

or equivalent because the script does not exist yet.

## Task 2: Implement Desktop Preflight

**Files:**
- Create: `apps/desktop/src/preflight.mjs`

- [ ] **Step 1: Create preflight script**

Create `apps/desktop/src/preflight.mjs`:

```js
import { accessSync, constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const checks = [];

function check(name, fn, fix) {
  try {
    const detail = fn();
    checks.push({ name, ok: true, detail: detail || "ok", fix: "" });
  } catch (error) {
    checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error), fix });
  }
}

function canRead(path) {
  accessSync(path, constants.R_OK);
  return path;
}

function commandVersion(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${command} exited ${result.status}`).trim());
  return (result.stdout || result.stderr || "").split(/\r?\n/)[0].trim();
}

check("frontend dist", () => canRead(resolve(root, "frontend/dist/index.html")), "Run: cd frontend && npm run build");
check("backend entry", () => canRead(resolve(root, "backend/main.py")), "Restore backend/main.py or run from the repository root.");
check("node", () => commandVersion("node"), "Install Node.js and make it available on PATH.");
check("npm", () => commandVersion("npm"), "Install npm and make it available on PATH.");
check("cargo", () => commandVersion("cargo"), "Install Rust/Cargo before running the Tauri shell.");
check("tauri cli", () => commandVersion("npx", ["tauri", "--version"]), "Install Tauri CLI or run npm install in apps/desktop after scaffold.");

const ok = checks.every((item) => item.ok);
console.log(JSON.stringify({ ok, checks }, null, 2));
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Verify preflight runs**

Run:

```bash
npm run desktop:preflight
```

Expected:

- Exit `0` only if frontend dist, Node, npm, Cargo, and Tauri are available.
- Exit `1` with JSON repair hints if prerequisites are missing.

This is acceptable in a machine without Rust/Tauri; the script must fail clearly, not crash.

## Task 3: Scaffold Tauri Shell

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src/startup.html`

- [ ] **Step 1: Add desktop package scripts**

Create `apps/desktop/package.json`:

```json
{
  "name": "branchwhisper-desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "preflight": "node src/preflight.mjs",
    "dev": "tauri dev",
    "build": "tauri build"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0"
  }
}
```

- [ ] **Step 2: Add startup screen**

Create `apps/desktop/src/startup.html` with:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BranchWhisper 启动中</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #171912;
        color: #f4f1e8;
        font-family: "Microsoft YaHei UI", system-ui, sans-serif;
      }
      main {
        width: min(720px, calc(100vw - 32px));
        display: grid;
        gap: 14px;
        padding: 24px;
        border: 1px solid #3a392f;
        border-radius: 8px;
        background: #28281f;
      }
      h1 { margin: 0; font-size: 24px; }
      p { margin: 0; color: #cfc8b9; line-height: 1.6; }
      code {
        padding: 10px;
        border-radius: 6px;
        background: #14160f;
        color: #ead08a;
        overflow-wrap: anywhere;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>BranchWhisper 正在启动</h1>
      <p>桌面壳会先启动或连接后端，然后打开 /app/。如果长时间停留在这里，请复制下面命令在终端运行。</p>
      <code>/home/me/miniconda3/bin/conda run -n qwen3-asr python backend/main.py --host 127.0.0.1 --port 7860</code>
    </main>
  </body>
</html>
```

- [ ] **Step 3: Add Tauri config**

Create `apps/desktop/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "BranchWhisper",
  "version": "0.1.0",
  "identifier": "app.branchwhisper.desktop",
  "build": {
    "beforeDevCommand": "",
    "beforeBuildCommand": "cd ../../frontend && npm run build",
    "frontendDist": "../src"
  },
  "app": {
    "windows": [
      {
        "title": "BranchWhisper",
        "width": 1280,
        "height": 820,
        "minWidth": 980,
        "minHeight": 680,
        "url": "startup.html"
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": false,
    "targets": "all",
    "icon": []
  }
}
```

- [ ] **Step 4: Add Rust metadata**

Create `apps/desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "branchwhisper-desktop"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
```

- [ ] **Step 5: Add minimal Rust app**

Create `apps/desktop/src-tauri/src/main.rs`:

```rust
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let _ = app.handle();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BranchWhisper desktop shell");
}
```

This first Rust step is intentionally minimal. Backend process management is added only after preflight and Tauri compile work.

## Task 4: Add Backend Startup Contract

**Files:**
- Modify: `apps/desktop/src-tauri/src/main.rs`

- [ ] **Step 1: Add startup design in code comments**

Before implementing child process launch, add one concise comment block:

```rust
// Startup contract:
// 1. If http://127.0.0.1:7860/api/health is alive, reuse that backend.
// 2. Otherwise start the configured backend command and capture logs.
// 3. Navigate to http://127.0.0.1:7860/app/ only after health responds.
// 4. If startup fails, keep startup.html visible with the copied command and log path.
```

- [ ] **Step 2: Do not implement local AI service startup**

Confirm no code starts ASR, LLM, TTS, WSL, CUDA, llama.cpp, Qwen ASR, or CosyVoice automatically in API mode.

Run:

```bash
grep -R "llama-server\|CosyVoice\|Qwen3-ASR\|nvidia-smi\|wsl" apps/desktop/src-tauri apps/desktop/src || true
```

Expected: only documentation or startup help text, not automatic local service startup.

## Task 5: Verification And Commit

**Files:**
- Same as Tasks 1-4.

- [ ] **Step 1: Run preflight**

Run:

```bash
npm run desktop:preflight
```

Expected:

- If Tauri/Rust prerequisites exist: JSON `ok: true`.
- If not: JSON `ok: false` with clear failed checks and fixes.

- [ ] **Step 2: Run frontend and backend regression checks**

Run:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_frontend_serving -v
cd frontend && npm run check:ui && npm run check && npm run build
```

- [ ] **Step 3: If Tauri is available, run desktop dev check**

Run:

```bash
cd apps/desktop && npm install && npm run dev
```

Expected:

- Window opens to startup screen.
- A later implementation can navigate to `/app/` after backend health.

If Tauri is not available, record the preflight failure in the runbook and continue to commit the scaffold.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add apps/desktop package.json docs/development/desktop-application-optimization-runbook.md .gitignore
git commit -m "feat: scaffold desktop shell"
git push origin main
```

Only include `.gitignore` if it changed.

## Fail / Rollback Rules

- If desktop scaffold breaks frontend or backend tests, revert only the desktop scaffold files and rerun existing checks.
- If Tauri config format is wrong, keep `apps/desktop/src/preflight.mjs`, fix config, and rerun `npm run desktop:preflight`.
- If root `package.json` scripts break existing dependencies, restore the dependency block and add only the missing script.
- If WSL or conda is unavailable, do not block API quick mode. Record the missing runtime as a local-runtime prerequisite and keep the startup screen repair command copyable.
- If the shell attempts to start local ASR/LLM/TTS services in API mode, remove that behavior before committing.

## Self-Review

- Spec coverage: covers desktop shell project, backend discovery/startup contract, startup failure screen, no local-runtime requirement in API mode, verification, commit, and push.
- Placeholder scan: no TBD/TODO/fill-in-later steps remain.
- Type consistency: uses `desktop:preflight`, `apps/desktop`, `startup.html`, and Tauri v2 config names consistently.
