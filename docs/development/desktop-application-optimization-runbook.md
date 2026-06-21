# Desktop Application Optimization Runbook

This runbook turns the desktop application design into a continuous execution loop:

```text
analyze problem
→ define phase plan
→ execute the smallest safe change
→ verify result
→ commit and push
→ enter next phase
```

Each phase must be completed, verified, committed, and pushed before the next phase starts.

## Global Rules

- API quick mode is the default path for zero-environment users.
- Local runtime mode is an optional enhancement path.
- Missing WSL, CUDA, conda, Qwen3 ASR, CosyVoice, or llama.cpp must not block API quick mode.
- Every behavior change starts with a failing automated check where practical.
- Every small optimization gets its own Git commit and push.
- Unrelated untracked files, such as `docs/hardware/`, must remain untouched unless the user explicitly asks to include them.

## Phase 1: Backend Serves Production Frontend

### Goal

Make sure the backend can serve the built Vue app at `/app/` without the Vite dev server. This is the foundation for a desktop shell because the shell should only need to start one backend process.

### Optimize

- Production frontend route `/app/`.
- Root redirect from `/` to `/app/`.
- Clear 503 message when `frontend/dist/index.html` is missing.
- Regression tests and deployment documentation.

### Execute

1. Add backend tests for `/`, `/app/`, and missing frontend dist.
2. Run the tests.
3. If tests fail because route behavior is missing, update `backend/app/server.py`.
4. Build frontend with `npm run build`.
5. Confirm backend frontend-serving tests pass.
6. Commit and push tests/docs.

### Watch Points

- Do not commit `frontend/dist/`.
- Keep `/api/*`, `/ws/dialog`, and `/runtime/*` untouched.
- Do not introduce a second frontend server.

### Verify

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_frontend_serving -v
cd frontend && npm run check:ui && npm run check && npm run build
```

### Pass

Commit and push, then enter Phase 2.

### Fail

- If `/app/` returns 404, fix backend shell routing.
- If assets fail, check Vite `base: "/app/"` and `/app/assets` mount.
- If build fails, fix frontend TypeScript or UI structure before continuing.

## Phase 2: API Quick Start Wizard

### Goal

Allow a new user with no local AI environment to configure API mode and enter the app.

### Optimize

- Add a first-run API quick start route/page.
- Reuse existing config fields for API LLM, ASR, and TTS.
- Make chat model required, ASR/TTS optional.
- Provide test buttons and clear repair hints.
- Save mode settings as API mode.

### Execute

1. Analyze current settings page API panels and config store.
2. Add a route such as `/setup`.
3. Add a setup page with four steps:
   - Welcome and mode choice.
   - Chat model API.
   - Speech recognition API.
   - Speech synthesis API and review.
4. Reuse existing API diagnostic calls:
   - LLM API test.
   - ASR API test.
   - TTS API test.
5. Save config through `/api/config`.
6. Add UI structure checks for the setup route and API-first copy.
7. Verify build and checks.
8. Commit and push.

### Watch Points

- Do not require local services in API mode.
- Do not ask for WSL/CUDA before the user chooses local runtime.
- Do not expose saved API keys in plain text.
- Keep local model configuration available but secondary.

### Verify

```bash
cd frontend && npm run check:ui && npm run check && npm run build
```

Browser verification:

```text
/app/setup opens
Quick Start is visually first
LLM API fields are present
ASR and TTS can be skipped
Saving sets API mode fields
```

### Pass

Commit and push, then enter Phase 3.

### Fail

- If setup route 404s, fix router registration.
- If config save fails, inspect `/api/config` payload and frontend field names.
- If API keys echo visibly, mask placeholders and avoid rendering stored secrets.
- If UI is cramped, simplify wizard steps before adding more controls.

## Phase 3: Mode-Aware Diagnostics

### Goal

Diagnostics should judge severity according to current mode. API users should not see local runtime gaps as fatal.

### Optimize

- Current mode detection.
- Required checks for API quick mode.
- Optional local enhancement checks.
- Repair recommendations grouped by mode.

### Execute

1. Add backend tests for diagnostics payload severity in API mode.
2. Add or extend frontend matching checks for required vs optional sections.
3. Update diagnostics page grouping.
4. Verify with API mode and local mode sample configs.
5. Commit and push.

### Watch Points

- Do not delete local runtime checks.
- Do not hide failures that are required for the active mode.
- Keep model names provider-agnostic.

### Verify

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_runtime_diagnostics -v
cd frontend && npm run check:ui && npm run check && npm run build
```

### Pass

Commit and push, then enter Phase 4.

### Fail

- If optional checks are still fatal, adjust severity mapping.
- If required API checks are missing, add explicit API probes.
- If UI mixes required and optional issues, split sections.

## Phase 4: Desktop Shell Launches Lightweight Backend

### Goal

Double-clicking the desktop app starts or finds the backend and opens `/app/`.

### Optimize

- Desktop shell project.
- Backend process launch.
- Port detection.
- Startup error screen.
- Shutdown cleanup.

### Execute

1. Choose Tauri unless a blocking dependency appears.
2. Create `apps/desktop/`.
3. Add dev launch command for backend.
4. Add production launch plan.
5. Add app window loading `/app/`.
6. Add startup failure screen.
7. Verify app opens with production frontend.
8. Commit and push.

### Watch Points

- Desktop shell must not own dialog logic.
- Do not require WSL for API mode startup.
- Keep backend logs visible or exportable.

### Verify

```text
desktop app opens
backend health is reached
/app/ loads
backend failure shows repair screen
app close stops child process
```

### Pass

Commit and push, then enter Phase 5.

### Fail

- If backend cannot start, show copied command and log path.
- If port is occupied, choose another port or show conflict guidance.
- If window is blank, load startup screen first, then navigate to backend.

### Execution Notes: 2026-06-21

- Added the first desktop shell scaffold under `apps/desktop/`.
- Added `npm run desktop:preflight` at the repository root.
- The preflight currently checks frontend dist, backend entry, Node, npm, Cargo, and Tauri CLI.
- On the current WSL machine, preflight returns structured JSON with `ok: false` because Cargo and Tauri CLI are not installed.
- This is an acceptable Phase 4 scaffold result because API quick mode and backend/frontend checks remain independent from local desktop packaging prerequisites.
- The desktop shell startup screen shows a copyable backend command using the required `qwen3-asr` conda environment.

Verification commands run for this scaffold:

```bash
npm run desktop:preflight
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_frontend_serving -v
cd frontend && npm run check:ui
cd frontend && npm run check
cd frontend && npm run build
/home/me/miniconda3/bin/conda run -n qwen3-asr python scripts/check_static_imports.py
git diff --check
```

## Phase 5: Local Runtime Wizard

### Goal

Guide advanced users through WSL, conda, CUDA, model directories, and local service profiles.

### Optimize

- WSL/Ubuntu detection.
- conda/qwen3-asr detection.
- CUDA/ffmpeg detection.
- model directory selection.
- `service_profiles.json` generation.

### Execute

1. Add backend setup-check endpoints.
2. Add local runtime wizard UI.
3. Add copyable repair commands.
4. Add service profile preview and save.
5. Verify local diagnostics.
6. Commit and push.

### Watch Points

- Do not auto-install heavy dependencies without user confirmation.
- Do not overwrite existing service profiles without backup or preview.
- Do not hard-code model names into logic.

### Verify

```text
fresh machine sees missing WSL with guidance
existing WSL detects Ubuntu
missing conda shows install guidance
model path missing shows picker and repair hint
service profile save is reversible
```

### Pass

Commit and push, then enter Phase 6.

### Fail

- If detection is unreliable, show raw command and captured output.
- If generated profile breaks existing config, restore prior file and fix migration.
- If setup feels too long, split into smaller steps.

## Phase 6: Local Service Management Enhancements

### Goal

Make local ASR, LLM, TTS, and bridge services manageable inside the app.

### Optimize

- service start/stop/restart.
- log viewing and copy.
- health checks.
- mode-specific service explanations.

### Execute

1. Add service page API-mode explanatory state.
2. Add better local service detail drawer if needed.
3. Add restart and log copy affordances.
4. Verify with service manager tests.
5. Commit and push.

### Watch Points

- Do not start local services automatically in API mode.
- Keep service command fields user-editable.
- Preserve logs unless the user clears them.

### Verify

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_service_runtime -v
cd frontend && npm run check:ui && npm run check && npm run build
```

### Pass

Commit and push, then enter Phase 7.

### Fail

- If service state is stale, refresh after actions.
- If logs are too noisy, add filters rather than deleting content.
- If commands are confusing, show configured and resolved command separately.

## Phase 7: Windows Packaging

### Goal

Produce a distributable Windows app that opens API quick mode without local AI dependencies.

### Optimize

- installer or portable build.
- bundled frontend and backend starter.
- app data directory.
- diagnostics export.

### Execute

1. Configure desktop build target.
2. Package frontend assets.
3. Package backend startup strategy.
4. Store runtime data outside install directory.
5. Test on a clean Windows user profile.
6. Commit and push packaging config.

### Watch Points

- Do not bundle model files in the first package.
- Do not store user secrets in the install directory.
- Do not silently require admin privileges for API mode.

### Verify

```text
fresh Windows user can install/open
API setup appears
LLM API test can run
conversation page opens
diagnostics export works
app update does not erase runtime data
```

### Fail

- If app needs admin unexpectedly, remove that dependency from API mode.
- If backend runtime is missing, improve bundled runtime or startup diagnostics.
- If user data is lost, block release and fix app-data paths.
