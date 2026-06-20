# API Quick Start Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an API-first setup flow so a zero-environment user can configure API mode and enter BranchWhisper without local AI services.

**Architecture:** Reuse the existing `/api/config` config surface and existing API diagnostic probes. Add a Vue setup route and page under `/app/setup`; keep local runtime setup as a secondary callout instead of a blocker.

**Tech Stack:** Vue 3, Vue Router, Pinia app store, existing diagnostics API, Vite checks.

---

## File Map

- Modify: `frontend/src/router/index.ts` to register `/setup`.
- Create: `frontend/src/pages/SetupPage.vue` for API quick start wizard.
- Create: `frontend/src/styles/pages/setup.css` for wizard layout.
- Modify: `frontend/src/styles/main.css` to import setup page styles.
- Modify: `frontend/src/components/layout/AppShell.vue` to add setup navigation/status affordance.
- Modify: `frontend/scripts/check-ui-structure.mjs` to enforce setup route, API-first copy, and non-local-blocking behavior.
- Optional modify: `docs/development/desktop-application-optimization-runbook.md` if the phase execution changes.

## Task 1: Add Failing UI Structure Checks

**Files:**
- Modify: `frontend/scripts/check-ui-structure.mjs`

- [ ] **Step 1: Add checks**

Add reads:

```js
const router = read("src/router/index.ts");
const appShell = read("src/components/layout/AppShell.vue");
const setupPage = read("src/pages/SetupPage.vue");
const setupCss = read("src/styles/pages/setup.css");
```

Add assertions:

```js
assert(router.includes('path: "/setup"'), "应用需要提供 /app/setup API 快速开始路由");
assert(appShell.includes('to="/setup"'), "顶部导航需要提供快速开始入口，方便零环境用户回到 API 配置");
assert(setupPage.includes("快速开始：API 模式"), "快速开始页需要明确 API 模式是默认上手路径");
assert(setupPage.includes("不需要安装 WSL、CUDA、conda 或本地模型"), "快速开始页需要说明零环境也能先使用 API");
assert(setupPage.includes("dialog_mode: \"api\"") && setupPage.includes("asr_provider_mode: \"api\"") && setupPage.includes("tts_provider_mode: \"api\""), "快速开始保存配置时需要切换 LLM/ASR/TTS 到 API 模式");
assert(setupPage.includes("可以稍后配置本地模型"), "快速开始页需要把本地运行时作为后续增强，而不是阻塞项");
assert(setupCss.includes(".setup-page.workspace-page"), "快速开始页需要使用共享 workspace 页面骨架");
assert(setupCss.includes("grid-template-columns: minmax(240px, 0.72fr) minmax(0, 1.28fr)"), "快速开始页桌面端需要使用步骤栏和配置区两栏布局");
```

- [ ] **Step 2: Run check and verify RED**

Run:

```bash
cd frontend && npm run check:ui
```

Expected: fails because `SetupPage.vue` and setup route do not exist yet.

## Task 2: Implement Setup Route And Page

**Files:**
- Modify: `frontend/src/router/index.ts`
- Create: `frontend/src/pages/SetupPage.vue`
- Create: `frontend/src/styles/pages/setup.css`
- Modify: `frontend/src/styles/main.css`
- Modify: `frontend/src/components/layout/AppShell.vue`

- [ ] **Step 1: Register setup route**

In `frontend/src/router/index.ts`, import:

```ts
import SetupPage from "@/pages/SetupPage.vue";
```

Add route:

```ts
{ path: "/setup", name: "setup", component: SetupPage },
```

- [ ] **Step 2: Add setup navigation**

In `frontend/src/components/layout/AppShell.vue`, import an icon such as `Rocket` from `@lucide/vue`, and add:

```ts
{ to: "/setup", label: "快速开始", icon: Rocket },
```

Place it after conversation or before settings so it is discoverable but not noisy.

- [ ] **Step 3: Create setup page**

Create `frontend/src/pages/SetupPage.vue` with:

- setup steps for welcome, LLM, ASR, TTS, review.
- provider presets copied from SettingsPage constants where needed.
- reactive `form: Partial<PublicConfig>`.
- `loadConfig()` on mount.
- `saveConfig()` when saving API mode.
- `runLlmApiDiagnostic()`, `runAsrApiDiagnostic()`, `runTtsApiDiagnostic()` buttons.
- ASR/TTS skip states.
- `router.push("/")` after successful save.

Minimum save payload:

```ts
const payload: Partial<PublicConfig> = {
  dialog_mode: "api",
  api_llm_url: form.api_llm_url,
  api_llm_model: form.api_llm_model,
  api_llm_api_key: form.api_llm_api_key,
  api_temperature: form.api_temperature,
  api_max_tokens: form.api_max_tokens,
  api_history_turns: form.api_history_turns,
  asr_provider_mode: asrSkipped.value ? form.asr_provider_mode || "local" : "api",
  api_asr_provider: form.api_asr_provider,
  api_asr_url: form.api_asr_url,
  api_asr_model: form.api_asr_model,
  api_asr_api_key: form.api_asr_api_key,
  api_asr_language: form.api_asr_language,
  api_asr_timeout: form.api_asr_timeout,
  tts_provider_mode: ttsSkipped.value ? form.tts_provider_mode || "local" : "api",
  api_tts_provider: form.api_tts_provider,
  api_tts_url: form.api_tts_url,
  api_tts_model: form.api_tts_model,
  api_tts_api_key: form.api_tts_api_key,
  api_tts_voice_mode: form.api_tts_voice_mode,
  api_tts_voice: form.api_tts_voice,
  api_tts_format: form.api_tts_format,
  api_tts_sample_rate: form.api_tts_sample_rate,
};
```

The literal object must include `dialog_mode: "api"`, `asr_provider_mode: "api"`, and `tts_provider_mode: "api"` in code paths used when ASR/TTS are enabled.

- [ ] **Step 4: Create setup styles**

Create `frontend/src/styles/pages/setup.css` with:

```css
.setup-page.workspace-page {
  width: min(1180px, calc(100vw - 32px));
  display: grid;
  gap: 18px;
}

.setup-workspace {
  display: grid;
  grid-template-columns: minmax(240px, 0.72fr) minmax(0, 1.28fr);
  gap: 16px;
  align-items: start;
}
```

Add responsive single-column layout under 860px.

- [ ] **Step 5: Import setup styles**

In `frontend/src/styles/main.css`, add:

```css
@import "./pages/setup.css";
```

## Task 3: Verify And Commit Setup Wizard

**Files:**
- Same as Task 2.

- [ ] **Step 1: Run UI checks**

Run:

```bash
cd frontend && npm run check:ui
```

Expected: passes.

- [ ] **Step 2: Run type check and build**

Run:

```bash
cd frontend && npm run check && npm run build
```

Expected: passes.

- [ ] **Step 3: Browser verify**

Open:

```text
http://127.0.0.1:5173/app/setup
```

Check:

- page opens.
- Quick Start API copy is visible.
- LLM fields are visible.
- ASR and TTS have skip controls.
- no horizontal overflow at desktop and mobile widths.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add frontend/src/router/index.ts frontend/src/pages/SetupPage.vue frontend/src/styles/pages/setup.css frontend/src/styles/main.css frontend/src/components/layout/AppShell.vue frontend/scripts/check-ui-structure.mjs
git commit -m "feat: add api quick start setup"
git push origin main
```

## Self-Review

- Spec coverage: covers Phase 2 API quick start route, wizard UI, API mode config, diagnostics hooks, and zero-environment copy.
- Placeholder scan: no placeholder work remains.
- Type consistency: uses existing `PublicConfig`, `loadConfig`, `saveConfig`, and diagnostics API names.
