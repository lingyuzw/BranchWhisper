# BranchWhisper Desktop Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current web-console desktop shell with a standalone BranchWhisper Studio app that opens to API/local mode selection and guides users without requiring a terminal or local model environment.

**Architecture:** Keep Tauri as the Windows desktop container, but stop treating the backend `/app/` page as the desktop home. Add a Studio-owned local UI in `apps/desktop/src/studio.html`, keep Rust responsible for backend lifecycle and status delivery, and expose advanced web pages only through explicit "Advanced Web Console" actions.

**Tech Stack:** Tauri 2, Rust, static HTML/CSS/JavaScript for the first Studio shell, existing FastAPI backend, existing Windows build scripts, Node built-in test runner.

---

## File Map

- Create `apps/desktop/src/studio.html`: standalone desktop Studio UI with mode selection, runtime status, API/local setup cards, logs, and explicit advanced web entry.
- Create `apps/desktop/src/studioPage.test.mjs`: static tests proving the desktop app opens to Studio, offers API/local mode, and does not use `/app/` as the primary home.
- Modify `apps/desktop/src-tauri/tauri.conf.json`: set the main window URL to `studio.html`.
- Modify `apps/desktop/src-tauri/src/main.rs`: update comments and keep startup status dispatch compatible with Studio.
- Modify `apps/desktop/src/startupPage.test.mjs`: keep legacy startup tests only if `startup.html` remains as a fallback recovery page.
- Modify `scripts/build_windows_desktop.ps1`: stop stale BranchWhisper processes before copying the desktop exe, so the user sees the latest build.
- Modify `docs/development/desktop-application-design.md`: keep the standalone Studio product contract current.
- Build output `C:\Users\Me\Desktop\BranchWhisper.exe`: must be updated after each desktop build.

## Task 1: Lock The Product Contract

**Files:**
- Modify: `docs/development/desktop-application-design.md`

- [ ] **Step 1: Verify the design says the exe is not a web wrapper**

Run:

```powershell
Select-String -LiteralPath docs\development\desktop-application-design.md -Pattern 'not a web page wrapper','Use API','Configure Local Runtime','must not automatically navigate to /app/'
```

Expected: all four patterns are present.

- [ ] **Step 2: Commit**

```bash
git add docs/development/desktop-application-design.md
git commit -m "docs: define standalone desktop studio"
git push origin main
```

## Task 2: Add Failing Studio Entry Tests

**Files:**
- Create: `apps/desktop/src/studioPage.test.mjs`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`

- [ ] **Step 1: Create the failing test**

Create `apps/desktop/src/studioPage.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const studioHtmlPath = resolve("apps/desktop/src/studio.html");
const tauriConfigPath = resolve("apps/desktop/src-tauri/tauri.conf.json");

test("desktop app opens to BranchWhisper Studio instead of legacy web console", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const config = JSON.parse(await readFile(tauriConfigPath, "utf8"));

  assert.equal(config.app.windows[0].url, "studio.html");
  assert.match(html, /BranchWhisper Studio/);
  assert.match(html, /data-studio-root/);
  assert.match(html, /data-mode="api"/);
  assert.match(html, /data-mode="local"/);
  assert.match(html, /Use API/);
  assert.match(html, /Configure Local Runtime/);
  assert.doesNotMatch(html, /window\.location\.href\s*=\s*appRoute/);
});

test("studio keeps advanced web console explicit", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /Advanced Web Console/);
  assert.match(html, /data-advanced-route="\/app\/"/);
  assert.doesNotMatch(html, /<meta[^>]+http-equiv="refresh"/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test apps/desktop/src/studioPage.test.mjs
```

Expected: FAIL because `apps/desktop/src/studio.html` does not exist and Tauri still points at `startup.html`.

## Task 3: Add Studio UI Skeleton

**Files:**
- Create: `apps/desktop/src/studio.html`

- [ ] **Step 1: Implement the minimal Studio page**

Create `apps/desktop/src/studio.html` with these required regions:

```html
<main class="studio-shell" data-studio-root>
  <aside class="studio-nav">
    <div class="brand">
      <strong>BranchWhisper Studio</strong>
      <span>Desktop App</span>
    </div>
    <button type="button" data-section="home" aria-current="page">Home</button>
    <button type="button" data-section="api">API Setup</button>
    <button type="button" data-section="local">Local Setup</button>
    <button type="button" data-section="wechat">WeChat</button>
    <button type="button" data-section="persona">Persona</button>
    <button type="button" data-section="logs">Logs</button>
    <button type="button" data-section="diagnostics">Diagnostics</button>
  </aside>
  <section class="studio-main">
    <header class="studio-header">
      <div>
        <p class="eyebrow">BranchWhisper Studio</p>
        <h1>Choose how BranchWhisper should run</h1>
        <p>Use API immediately, or configure a local model runtime with guided checks.</p>
      </div>
      <div class="header-actions">
        <button type="button" data-action="retry">Recheck</button>
        <button type="button" data-action="export">Export Report</button>
        <button type="button" data-advanced-route="/app/">Advanced Web Console</button>
      </div>
    </header>
    <section class="mode-grid">
      <button class="mode-card primary" type="button" data-mode="api">
        <span>Recommended</span>
        <strong>Use API</strong>
        <small>Works without WSL, CUDA, conda, local models, llama.cpp, CosyVoice, Qwen ASR, or OpenClaw.</small>
      </button>
      <button class="mode-card" type="button" data-mode="local">
        <span>Advanced</span>
        <strong>Configure Local Runtime</strong>
        <small>Guides WSL, qwen3-asr, Python, Node, ffmpeg, CUDA, model paths, and local services.</small>
      </button>
    </section>
    <section class="panel active" data-panel="api">
      <h2>API Setup</h2>
      <p>Enter an OpenAI-compatible chat API first. ASR and TTS are optional.</p>
    </section>
    <section class="panel" data-panel="local">
      <h2>Local Runtime Setup</h2>
      <p>Check each dependency before starting local ASR, LLM, TTS, and WeChat bridge services.</p>
    </section>
  </section>
</main>
```

Add CSS in the same file so the first version already looks like a desktop utility: fixed left navigation, wide work area, restrained colors, readable text, consistent buttons.

- [ ] **Step 2: Add minimal interaction**

Add plain JavaScript to:

- switch `data-panel="api"` and `data-panel="local"` when mode cards are clicked
- mark the active nav item with `aria-current="page"`
- open advanced web console only when `data-advanced-route` is clicked
- listen for `branchwhisper:startup-status` and update backend status text

- [ ] **Step 3: Run test**

Run:

```powershell
node --test apps/desktop/src/studioPage.test.mjs
```

Expected: FAIL until `tauri.conf.json` is changed to `studio.html`.

## Task 4: Point Tauri At Studio

**Files:**
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src-tauri/src/main.rs`

- [ ] **Step 1: Change main window URL**

In `apps/desktop/src-tauri/tauri.conf.json`, change:

```json
"url": "startup.html"
```

to:

```json
"url": "studio.html"
```

- [ ] **Step 2: Update Rust startup comment**

In `apps/desktop/src-tauri/src/main.rs`, update the startup contract comment so step 3 says:

```rust
// 3. Keep studio.html visible as the desktop Studio after health responds.
```

- [ ] **Step 3: Run tests**

Run:

```powershell
node --test apps/desktop/src/studioPage.test.mjs apps/desktop/src/startupPage.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run Rust tests**

Run:

```powershell
wsl.exe -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/apps/desktop/src-tauri -- /home/me/.cargo/bin/cargo test -- --nocapture
```

Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add apps/desktop/src/studio.html apps/desktop/src/studioPage.test.mjs apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/src/main.rs
git commit -m "feat: open desktop app to studio shell"
git push origin main
```

## Task 5: Make Desktop Copy Reliable

**Files:**
- Modify: `scripts/build_windows_desktop.ps1`
- Test: add assertions to an existing or new PowerShell-safe script test if available; otherwise use static search in the build verification step.

- [ ] **Step 1: Add stale process cleanup before copying**

Before `Copy-Item -LiteralPath $ExePath -Destination $DesktopExePath -Force`, insert:

```powershell
Get-Process BranchWhisper -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
```

- [ ] **Step 2: Verify script contains cleanup**

Run:

```powershell
Select-String -LiteralPath scripts\build_windows_desktop.ps1 -Pattern 'Get-Process BranchWhisper','Stop-Process -Force','Copy-Item -LiteralPath $ExePath'
```

Expected: all three patterns are present.

- [ ] **Step 3: Commit and push**

```bash
git add scripts/build_windows_desktop.ps1
git commit -m "fix: replace stale desktop exe during build"
git push origin main
```

## Task 6: Build, Copy, And Screenshot

**Files:**
- Build output: `C:\Users\Me\Desktop\BranchWhisper.exe`

- [ ] **Step 1: Stop running processes**

Run:

```powershell
Get-Process BranchWhisper,branchwhisper-backend -ErrorAction SilentlyContinue | Stop-Process -Force
```

- [ ] **Step 2: Build desktop app**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build_windows_desktop.ps1 -BackendExecutable "$env:LOCALAPPDATA\BranchWhisper\backend-build\dist\branchwhisper-backend\branchwhisper-backend.exe"
```

Expected: build succeeds and copies `BranchWhisper.exe` to the desktop.

- [ ] **Step 3: Launch desktop exe**

Run:

```powershell
Start-Process "$env:USERPROFILE\Desktop\BranchWhisper.exe"
```

- [ ] **Step 4: Capture screenshot**

Use the existing PowerShell `PrintWindow` capture helper and save:

```text
%TEMP%\branchwhisper-studio.png
```

Expected: screenshot shows `BranchWhisper Studio`, `Use API`, and `Configure Local Runtime`.

- [ ] **Step 5: Verify no visible backend console**

Run:

```powershell
Get-Process BranchWhisper,branchwhisper-backend -ErrorAction SilentlyContinue |
  Select-Object ProcessName,Id,MainWindowTitle,Path
```

Expected: `BranchWhisper` has a normal window title; `branchwhisper-backend` has an empty `MainWindowTitle`.

## Task 7: Continue To API Mode Implementation

After Task 6 passes, create the next plan or extend this plan with concrete API wizard tasks:

- backend endpoint check for config read/write
- Studio API form state
- LLM test call
- save config
- fresh-machine no-local-dependency verification

Do not start local runtime wizard before API mode works end to end.

