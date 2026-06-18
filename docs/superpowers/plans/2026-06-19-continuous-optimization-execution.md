# BranchWhisper Continuous Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize BranchWhisper through a continuous, versioned loop: analyze one small risk area, implement the smallest useful improvement, verify it, commit and push it, then automatically move to the next gated stage.

**Architecture:** Keep the runtime model provider-agnostic. Diagnostics, service control, dialog tracing, frontend pages, and integrations must read roles, capabilities, commands, cwd, ports, and paths from profile/config data instead of hard-coding current model names such as Qwen, CosyVoice, llama.cpp, or OpenClaw. Each stage preserves existing API and WebSocket compatibility unless the stage explicitly states an additive schema extension.

**Tech Stack:** Python/FastAPI backend run through `conda run -n qwen3-asr`, Vue 3/Vite/Pinia frontend, Node tests for Weixin/OpenClaw helpers, `unittest`, `npm run check`, `npm run build`, Git commit and push after every verified small optimization.

---

## Global Execution Contract

Every optimization point follows this loop:

1. Analyze the smallest current problem.
2. Write or update the focused regression check first.
3. Run the focused check and confirm the expected failure when new behavior is not implemented yet.
4. Implement the minimal compatible change.
5. Run the focused verification.
6. Run the stage-level verification gate.
7. Commit the verified small point.
8. Push the commit to `origin/main`.
9. Move to the next point only after the push succeeds.

Use these command forms from Windows/PowerShell:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git status --short --branch
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git add <files>
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git commit -m "<message>"
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git push
```

Use this Python executable form for backend checks:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_runtime_diagnostics -v
```

Do not commit generated runtime data, logs, model files, databases, or secrets under `runtime/`.

If a check fails before commit:

- Keep the worktree in place.
- Read the failing output.
- Fix forward when the failure is caused by the current edit.
- Use `git diff` to isolate only the current edit.
- If the current edit is the wrong direction, revert only the files touched by the current optimization point with `git restore -- <files>` after confirming they do not contain user changes.
- Rerun the same failed command before continuing.

If a failure is discovered after commit but before push:

- Create a fix commit when the change is close.
- Create a revert commit only if the committed direction is unsafe.
- Push only after the stage gate passes.

If a failure is discovered after push:

- Do not rewrite history.
- Add a new fix-forward commit, or a new revert commit followed by a corrected implementation.

## Stage 0: Plan Anchor And Baseline

**Objective:** Put this execution plan under version control and confirm the repo is ready for continuous optimization.

**Files:**

- Create: `docs/superpowers/plans/2026-06-19-continuous-optimization-execution.md`

**Steps:**

- [ ] Check current branch and cleanliness:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git status --short --branch
```

Expected: branch is `main...origin/main`; only this plan file may be untracked or modified.

- [ ] Verify the documentation diff:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git diff -- docs/superpowers/plans/2026-06-19-continuous-optimization-execution.md
```

Expected: the diff contains only this execution plan.

- [ ] Run whitespace validation:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git diff --check
```

Expected: exit code `0`.

- [ ] Commit and push:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git add docs/superpowers/plans/2026-06-19-continuous-optimization-execution.md
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git commit -m "docs: add continuous optimization execution plan"
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git push
```

**Done when:** the plan exists on `origin/main`.

**Failure handling:** If the push fails due to network or credentials, keep the local commit and retry push before starting Stage 1.

## Stage 1: Diagnostics Center Repairability

**Objective:** Make the diagnostics center explain exactly what was checked, what path/command it resolved to, why a check failed, and what to do next without tying the UI or backend to a specific model name.

**Why this comes first:** It has the highest operational return. If startup, paths, ports, ffmpeg, CUDA, Python/Node, llama.cpp, CosyVoice, ASR, or OpenClaw fail, the user needs a precise reason before deeper refactors matter.

**Design rule for model replacement:** Diagnostic logic must use generic fields such as `role`, `provider`, `capabilities`, `cwd`, `command`, `model_path`, `required_bins`, `optional_bins`, `required_files`, `port`, and `health_url`. Current names such as `Qwen ASR`, `CosyVoice`, `llama.cpp`, and `OpenClaw` are labels read from config, not conditions in code. Replacing a model should require changing profile data, not rewriting diagnostics code.

### Task 1.1: Add Resolved Target Metadata

**Files:**

- Modify: `backend/diagnostics/runtime.py`
- Modify: `backend/tests/test_runtime_diagnostics.py`

**Steps:**

- [ ] Add tests proving relative `model_path`, relative command binaries, `cwd`, and `required_files` expose:
  - original target
  - resolved path
  - resolution base
  - existence result
  - fix suggestion

- [ ] Run the focused test:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_runtime_diagnostics -v
```

Expected before implementation: new assertions fail.

- [ ] Implement generic metadata in diagnostic checks. Use keys:
  - `raw_target`
  - `resolved_target`
  - `resolution_base`
  - `exists`
  - `profile_cwd`
  - `workspace_root`

- [ ] Rerun the focused test.

- [ ] Run stage backend gate:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_runtime_diagnostics -v
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m compileall backend/diagnostics backend/api
```

- [ ] Commit and push:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git add backend/diagnostics/runtime.py backend/tests/test_runtime_diagnostics.py
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git commit -m "feat: expose resolved diagnostic targets"
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git push
```

**Done when:** API diagnostics include resolved path metadata and existing tests pass.

**Failure handling:** If metadata leaks secrets from environment values, remove sensitive env display and keep only path/command target metadata.

### Task 1.2: Improve Diagnostics UI Repair Flow

**Files:**

- Modify: `frontend/src/api/diagnostics.ts`
- Modify: `frontend/src/pages/DiagnosticsPage.vue`
- Create if the page grows: `frontend/src/components/diagnostics/DiagnosticCheckList.vue`

**Steps:**

- [ ] Add TypeScript types for diagnostic `metadata`.

- [ ] Show each failed or warning check with:
  - raw target
  - resolved target
  - failure reason
  - repair suggestion
  - copyable diagnostics JSON already available through the page button

- [ ] Keep status labels generic: `路径`, `命令`, `端口`, `健康检查`, `依赖`, `配置`.

- [ ] Run frontend checks:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run build
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check:ui
```

- [ ] Commit and push:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git add frontend/src/api/diagnostics.ts frontend/src/pages/DiagnosticsPage.vue frontend/src/components/diagnostics
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git commit -m "feat: show repair details in diagnostics page"
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git push
```

**Done when:** the diagnostics page makes false path/binary problems inspectable from the browser without opening code.

**Failure handling:** If the page becomes visually cramped, split the check list into the component listed above before committing.

### Task 1.3: Add Runtime Tool Diagnostics

**Files:**

- Modify: `backend/api/diagnostics.py`
- Modify: `backend/diagnostics/runtime.py`
- Modify: `backend/tests/test_runtime_diagnostics.py`

**Steps:**

- [ ] Add tests for generic tool profiles covering Python, Node, npm, ffmpeg, CUDA command discovery, and OpenClaw command discovery.

- [ ] Implement additive profile creation for tool checks. Treat tool names as labels; check availability through command resolution.

- [ ] Keep missing optional tools as `warning` unless the current profile marks them required.

- [ ] Run:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_runtime_diagnostics -v
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest discover -s backend/tests -p "test_*.py" -v
```

- [ ] Commit and push:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git add backend/api/diagnostics.py backend/diagnostics/runtime.py backend/tests/test_runtime_diagnostics.py
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git commit -m "feat: add generic runtime tool diagnostics"
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git push
```

**Done when:** diagnostics can report environment/tool readiness even before a service is started.

**Failure handling:** If CUDA detection varies by machine, mark CUDA as capability-driven and avoid failing machines that do not declare GPU usage.

## Stage 2: Service Profile And Runtime State Unification

**Objective:** Make service start/stop, diagnostics, settings, and health status use one canonical profile interpretation path.

**Files:**

- Create: `backend/service_runtime/profiles.py`
- Modify: `backend/service_runtime/services.py`
- Modify: `backend/diagnostics/runtime.py`
- Modify: `backend/api/services.py`
- Modify: `backend/tests/test_service_runtime.py`
- Modify: `backend/tests/test_runtime_diagnostics.py`

**Steps:**

- [ ] Extract profile loading and path token resolution from service runtime into `backend/service_runtime/profiles.py`.

- [ ] Add tests proving `${PROJECT_ROOT}`, `${WORKSPACE_ROOT}`, `BRANCHWHISPER_WORKSPACE_ROOT`, profile `cwd`, relative `command`, and relative `model_path` resolve identically for service startup and diagnostics.

- [ ] Keep old `runtime/service_profiles.json` compatible. If schema metadata is added, make it additive:

```json
{
  "schema_version": 2,
  "services": {}
}
```

- [ ] Run:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_service_runtime -v
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_runtime_diagnostics -v
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m compileall backend/service_runtime backend/diagnostics backend/api
```

- [ ] Commit and push after each extracted helper or compatibility shim, not as one large commit.

**Done when:** changing a profile path in one place affects service startup, diagnostics, and settings consistently.

**Failure handling:** If extraction risks changing startup behavior, keep the old call path and add adapter functions around it first; do not migrate all callers in one commit.

## Stage 3: Dialog Trace And Failure Attribution

**Objective:** Make text and voice dialog failures explain which stage failed: input normalization, ASR, LLM, tool call, memory, TTS, media, or external delivery.

**Files:**

- Modify: `backend/dialog/trace.py`
- Modify: `backend/dialog/session.py`
- Modify: `backend/api/diagnostics.py`
- Modify: `frontend/src/pages/DiagnosticsPage.vue`
- Modify: `backend/tests/test_dialog_trace.py`

**Steps:**

- [ ] Extend trace events with additive fields:
  - `stage`
  - `status`
  - `duration_ms`
  - `profile_role`
  - `profile_name`
  - `failure_reason`

- [ ] Add tests for successful text dialog trace and failing voice pipeline trace.

- [ ] Keep existing `/api/diagnostics/dialog-traces` response compatible by adding fields rather than renaming current fields.

- [ ] Run:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_dialog_trace -v
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest discover -s backend/tests -p "test_*.py" -v
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run build
```

- [ ] Commit and push each trace extension and UI display improvement separately.

**Done when:** a failed voice or external-channel reply has a visible trace reason without reading backend logs.

**Failure handling:** If trace storage grows too quickly, cap retained trace count before adding more event details.

## Stage 4: Frontend Page Decomposition

**Objective:** Reduce risk in large Vue pages so future UI changes are easier to review and test.

**Files:**

- Modify: `frontend/src/pages/SettingsPage.vue`
- Modify: `frontend/src/pages/DiagnosticsPage.vue`
- Modify as needed: `frontend/src/pages/IntegrationsPage.vue`
- Create focused components under:
  - `frontend/src/components/settings/`
  - `frontend/src/components/diagnostics/`
  - `frontend/src/components/integrations/`

**Steps:**

- [ ] Split one panel at a time from `SettingsPage.vue`; keep props/events explicit.

- [ ] After each panel extraction, run:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check:ui
```

- [ ] Commit and push each panel extraction separately:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git add frontend/src/pages/SettingsPage.vue frontend/src/components/settings
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git commit -m "refactor: extract <panel-name> settings panel"
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git push
```

- [ ] Run full frontend gate at the end of the stage:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run build
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check:ui
```

**Done when:** `SettingsPage.vue`, `DiagnosticsPage.vue`, and `IntegrationsPage.vue` delegate repeated UI sections to focused components and keep behavior unchanged.

**Failure handling:** If a split causes prop/event churn, stop after the last passing commit and reduce the component boundary to one smaller panel.

## Stage 5: Weixin And OpenClaw Reliability

**Objective:** Make external delivery predictable, diagnosable, and safe to fall back from text to voice or from voice to text.

**Files:**

- Modify: `backend/integration_runtime/manager.py`
- Modify: `backend/integration_runtime/openclaw_bridge.py`
- Modify: `backend/integration_runtime/weixin_voice_sender.mjs`
- Modify: `backend/tests/test_integration_manager.py`
- Modify: `backend/tests/test_weixin_voice_sender.mjs`

**Steps:**

- [ ] Extract one pure helper at a time from `manager.py` for target selection, send mode selection, media preparation, and fallback reason.

- [ ] Add tests for:
  - text-only fallback when voice conversion fails
  - missing OpenClaw binary
  - missing ffmpeg or silk conversion tool
  - unavailable target conversation

- [ ] Run:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_integration_manager -v
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper node --test backend/tests/test_weixin_voice_sender.mjs
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest discover -s backend/tests -p "test_*.py" -v
```

- [ ] Commit and push each helper extraction or behavior fix separately.

**Done when:** integration failures surface as explicit reasons in API/UI diagnostics and do not silently drop replies.

**Failure handling:** If Node-side behavior differs by installed OpenClaw version, mock command execution in tests and keep real command probing in diagnostics only.

## Stage 6: Dialog And Voice Pipeline Split

**Objective:** Split `backend/dialog/session.py` into smaller units while preserving current WebSocket behavior.

**Files:**

- Modify: `backend/dialog/session.py`
- Create as needed:
  - `backend/dialog/transport.py`
  - `backend/dialog/orchestration.py`
  - `backend/dialog/voice_pipeline.py`
  - `backend/dialog/memory_tasks.py`
  - `backend/dialog/tool_flow.py`
- Modify tests under `backend/tests/`

**Steps:**

- [ ] Identify one pure helper currently inside `session.py`.

- [ ] Move it to the smallest new module.

- [ ] Add or update tests that exercise behavior through public session/dialog APIs rather than private implementation details.

- [ ] Run:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest discover -s backend/tests -p "test_*.py" -v
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m compileall backend/dialog backend/api
```

- [ ] Commit and push after each extraction.

**Done when:** voice/text dialog orchestration, transport, memory tasks, and tool flow can be read independently and full backend tests still pass.

**Failure handling:** If WebSocket behavior becomes hard to test, pause extraction and first add a small harness around the existing public interface.

## Stage 7: Runtime Data Safety And Maintenance

**Objective:** Reduce corruption and maintenance risk in local runtime files.

**Files:**

- Modify: `backend/core/io_utils.py`
- Modify repositories under `backend/repositories/`
- Modify related tests under `backend/tests/`
- Modify docs:
  - `docs/architecture/runtime-files.md`
  - `runtime/README.md`

**Steps:**

- [ ] Ensure JSON writes that affect settings, service profiles, integration state, and memory metadata use atomic write helpers.

- [ ] Add tests for interrupted write behavior where feasible using temporary directories.

- [ ] Add log retention guidance for service logs without deleting user logs automatically.

- [ ] Run:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest discover -s backend/tests -p "test_*.py" -v
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m compileall backend services
```

- [ ] Commit and push each repository/io improvement separately.

**Done when:** runtime settings updates are atomic and documented.

**Failure handling:** If a repository already has custom write semantics, add tests around the existing behavior before replacing it.

## Stage 8: Full Regression And Operator Runbook

**Objective:** Finish the optimization pass with a repeatable local verification checklist.

**Files:**

- Modify: `README.md`
- Modify: `docs/deployment/local-deploy.md`
- Modify: `docs/development/refactor-roadmap.md`
- Create: `docs/development/optimization-runbook.md`

**Steps:**

- [ ] Create a runbook with exact commands:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest discover -s backend/tests -p "test_*.py" -v
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m compileall backend services
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python scripts/check_static_imports.py
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper node --test backend/tests/test_weixin_voice_sender.mjs
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run build
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check:ui
```

- [ ] Update docs to state backend/page runtime should be started from `qwen3-asr`:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python backend/main.py --host 127.0.0.1 --port 7860
```

- [ ] Run the full regression command set from the runbook.

- [ ] Commit and push:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git add README.md docs/deployment/local-deploy.md docs/development/refactor-roadmap.md docs/development/optimization-runbook.md
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git commit -m "docs: add optimization runbook"
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git push
```

**Done when:** the repository documents the exact verification and startup commands used during this pass.

**Failure handling:** If full regression fails because of an unrelated existing issue, create a documented blocker section with the exact failing command and start a new small fix point for that failure before declaring the pass complete.

## Automatic Stage Transition Rules

After a task passes:

- Commit the task.
- Push the commit.
- Confirm `git status --short --branch` shows no pending tracked changes.
- Start the next task in the same stage.

After a stage passes:

- Run the stage gate one final time.
- Push any final docs or cleanup commit.
- Start the next stage automatically.

When a stage fails:

- Do not continue to the next stage.
- Capture the exact command and failing output.
- Fix forward inside the current stage if possible.
- If the current stage direction is wrong, revert with a new commit only after preserving user changes.
- Rerun the failed command, then rerun the stage gate.

## Current Next Action

Start with Stage 0. After the plan is pushed, proceed to Stage 1 Task 1.1: resolved diagnostic target metadata. This directly follows the recent path-resolution fix and gives the diagnostics center better evidence for future model or binary changes.
