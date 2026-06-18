# Runtime Diagnostics Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BranchWhisper easier to start, diagnose, and evolve by adding provider/profile-driven runtime diagnostics before deeper service, dialog, memory, frontend, and integration refactors.

**Architecture:** Start with a backend diagnostics model that evaluates generic service profiles instead of hard-coded model names. Expose the results through a stable API, then add UI, trace, service profile, and refactor stages only after each previous stage is verified and committed.

**Tech Stack:** Python 3/FastAPI backend, Vue 3/Vite frontend, existing runtime JSON files, pytest, node test runner, npm build checks, Git commits after each verified optimization point.

---

## Execution Rules

- Commit after every small verified optimization point.
- Push after each commit when remote authentication is available.
- Preserve `runtime/` user data and existing API/WebSocket compatibility.
- Prefer additive compatibility fields over destructive schema rewrites.
- Use provider/profile-driven checks; do not hard-code Qwen, CosyVoice, llama.cpp, or other current model names into diagnostics logic.
- If a verification step fails, stop the stage, inspect the failure, fix or revert the last small change, then rerun the same verification before continuing.

## Stage 0: Baseline And Version Anchor

**Objective:** Record the optimization flow and establish a clean starting point.

**Files:**
- Create: `docs/superpowers/plans/2026-06-19-runtime-diagnostics-optimization.md`

- [ ] Verify the working tree is clean before edits:

```bash
git status --short --branch
```

Expected: no unstaged files from this optimization point.

- [ ] Add this plan document.

- [ ] Verify documentation-only change:

```bash
git diff -- docs/superpowers/plans/2026-06-19-runtime-diagnostics-optimization.md
```

Expected: the new plan describes staged diagnostics optimization.

- [ ] Commit:

```bash
git add docs/superpowers/plans/2026-06-19-runtime-diagnostics-optimization.md
git commit -m "docs: add runtime diagnostics optimization plan"
git push
```

If `git push` fails because authentication is unavailable, keep the local commit and continue with local version management.

## Stage 1: Provider/Profile Diagnostics Core

**Objective:** Add a generic diagnostics core that can evaluate ASR, LLM, TTS, integration, and tool profiles without hard-coding provider names.

**Files:**
- Create: `backend/diagnostics/__init__.py`
- Create: `backend/diagnostics/runtime.py`
- Create: `backend/tests/test_runtime_diagnostics.py`

### Task 1.1: Define Runtime Diagnostic Item Evaluation

- [ ] Write failing tests for path, binary, port, health URL, and overall severity evaluation in `backend/tests/test_runtime_diagnostics.py`.

- [ ] Run:

```bash
python -m pytest backend/tests/test_runtime_diagnostics.py -q
```

Expected: fails because `backend.diagnostics.runtime` does not exist.

- [ ] Implement `backend/diagnostics/runtime.py` with:

```text
RuntimeDiagnosticProfile
RuntimeDiagnosticCheck
RuntimeDiagnosticItem
evaluate_profile(profile, *, workspace_root, command_resolver, port_checker, health_checker)
evaluate_profiles(profiles, ...)
```

- [ ] Run:

```bash
python -m pytest backend/tests/test_runtime_diagnostics.py -q
```

Expected: all new diagnostics tests pass.

- [ ] Commit:

```bash
git add backend/diagnostics/__init__.py backend/diagnostics/runtime.py backend/tests/test_runtime_diagnostics.py
git commit -m "feat: add provider profile diagnostics core"
git push
```

### Task 1.2: Adapt Existing Service Profiles Into Diagnostics Profiles

**Files:**
- Modify: `backend/diagnostics/runtime.py`
- Test: `backend/tests/test_runtime_diagnostics.py`

- [ ] Add failing tests showing existing `service_profiles.json` style dictionaries convert to role-based diagnostics profiles for `asr`, `llm`, and `tts`.

- [ ] Run:

```bash
python -m pytest backend/tests/test_runtime_diagnostics.py -q
```

Expected: fails because adapter function is missing.

- [ ] Add adapter:

```text
profiles_from_service_config(config)
```

It should preserve unknown provider names as labels, not dispatch on them.

- [ ] Run:

```bash
python -m pytest backend/tests/test_runtime_diagnostics.py -q
```

Expected: pass.

- [ ] Commit:

```bash
git add backend/diagnostics/runtime.py backend/tests/test_runtime_diagnostics.py
git commit -m "feat: adapt service profiles for diagnostics"
git push
```

### Task 1.3: Expose Runtime Diagnostics API

**Files:**
- Modify: `backend/api/diagnostics.py`
- Test: `backend/tests/test_runtime_diagnostics.py`

- [ ] Add tests for API-ready payload shape using the diagnostics core.

- [ ] Run:

```bash
python -m pytest backend/tests/test_runtime_diagnostics.py -q
```

Expected: fails until payload builder exists.

- [ ] Add payload builder in diagnostics core and wire a new route:

```text
GET /api/diagnostics/runtime
```

- [ ] Run:

```bash
python -m pytest backend/tests/test_runtime_diagnostics.py -q
python -m compileall backend services
```

Expected: pass.

- [ ] Commit:

```bash
git add backend/diagnostics/runtime.py backend/api/diagnostics.py backend/tests/test_runtime_diagnostics.py
git commit -m "feat: expose runtime diagnostics api"
git push
```

## Stage 2: Diagnostics UI

**Objective:** Add a read-only frontend diagnostics view that shows profile health, failure reasons, and repair suggestions.

**Gate:** Start only after Stage 1 passes and is committed.

**Validation:**

```bash
cd frontend
npm run check
npm run build
```

Commit after the route, API client, and page each pass type/build checks.

## Stage 3: Dialog Trace

**Objective:** Add low-risk per-turn trace events for the main dialog pipeline.

**Gate:** Start only after Stage 2 passes and is committed.

**Validation:**

```bash
python -m pytest backend/tests -q
python -m compileall backend services
```

Commit after the backend trace model, trace API, and frontend trace view each pass their checks.

## Stage 4: Service Profile Unification

**Objective:** Upgrade service profiles into versioned, diagnosable, provider-agnostic profiles while preserving old runtime config compatibility.

**Gate:** Start only after Stage 3 passes and is committed.

**Validation:**

```bash
python -m pytest backend/tests/test_service_runtime.py -q
python -m pytest backend/tests/test_runtime_diagnostics.py -q
python -m compileall backend services
```

Commit after schema migration, service manager integration, and UI edits each pass.

## Stage 5: Dialog Module Split

**Objective:** Split `backend/dialog/session.py` into focused modules without changing WebSocket behavior.

**Gate:** Start only after Stage 4 passes and is committed.

**Validation:**

```bash
python -m pytest backend/tests -q
python -m compileall backend services
```

Commit after each extracted module.

## Stage 6: Memory And Tool Split

**Objective:** Split historical memory/tool responsibilities out of `backend/tools/runtime_brain.py`.

**Gate:** Start only after Stage 5 passes and is committed.

**Validation:**

```bash
python -m pytest backend/tests/test_memory_decay.py -q
python -m pytest backend/tests -q
```

Commit after each extracted memory or tool component.

## Stage 7: Frontend Settings Structure

**Objective:** Split large settings and integrations pages into focused Vue panels without changing saved settings behavior.

**Gate:** Start only after Stage 6 passes and is committed.

**Validation:**

```bash
cd frontend
npm run check
npm run build
npm run check:ui
```

Commit after each panel extraction.

## Stage 8: Integration Boundary Stabilization

**Objective:** Keep external channel adapters thin and ensure Weixin/OpenClaw behavior remains covered by replay tests.

**Gate:** Start only after Stage 7 passes and is committed.

**Validation:**

```bash
python -m pytest backend/tests/test_integration_manager.py -q
node --test backend/tests/test_weixin_voice_sender.mjs
```

Commit after each adapter boundary cleanup.

## Final Acceptance

Run:

```bash
python -m compileall backend services
python scripts/check_static_imports.py
python -m pytest backend/tests -q
node --test backend/tests/test_weixin_voice_sender.mjs
cd frontend && npm run check && npm run build && npm run check:ui
```

Manual checks:

- Diagnostics page identifies current ASR/LLM/TTS profile status.
- Changing a profile path to a bad value produces a clear diagnostics error and repair suggestion.
- Restoring the profile clears the diagnostics error.
- A text dialog turn completes and records trace events.
- A voice dialog turn either completes or pinpoints the failed ASR/LLM/TTS stage.
