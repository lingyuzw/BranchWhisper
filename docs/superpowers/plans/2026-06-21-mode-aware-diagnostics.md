# Mode-Aware Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make runtime diagnostics judge failures according to the active mode, so API quick mode is usable without local Qwen/CosyVoice/llama.cpp/CUDA/OpenClaw dependencies.

**Architecture:** Keep the existing runtime profile evaluator as the source of path, binary, port, and health evidence. Add a mode context layer that marks each diagnostic item as `required` or `optional`, downgrades optional local-runtime failures to warnings, and adds API configuration checks for the active API providers. The frontend consumes the new metadata and clearly separates required blockers from optional local enhancements.

**Tech Stack:** Python unittest + FastAPI diagnostics router, Vue 3 diagnostics dashboard, existing `npm run check:ui` structure checks.

---

## File Map

- Modify: `backend/diagnostics/runtime.py`
  - Add mode context helpers.
  - Add `requirement` metadata to diagnostic items and checks.
  - Add API configuration diagnostic items for active API LLM/ASR/TTS.
  - Downgrade optional local-runtime errors to warnings without hiding the original evidence.
- Modify: `backend/api/diagnostics.py`
  - Pass `request.app.state.settings` into `runtime_diagnostics_payload`.
- Modify: `backend/tests/test_runtime_diagnostics.py`
  - Add RED tests for API mode severity, required API config checks, local mode blockers, and route metadata.
- Modify: `frontend/src/api/diagnostics.ts`
  - Add `mode` and `requirement` fields to diagnostic types.
- Modify: `frontend/src/pages/DiagnosticsPage.vue`
  - Show active mode in the overview.
  - Show required/optional badges on services and checks.
  - Make repair copy explain that optional local runtime gaps do not block API mode.
- Modify: `frontend/src/components/diagnostics/DiagnosticCheckList.vue`
  - Render required/optional labels for checks.
- Modify: `frontend/scripts/check-ui-structure.mjs`
  - Enforce mode-aware diagnostics copy and metadata rendering.

## Task 1: Add Failing Backend Mode Tests

**Files:**
- Modify: `backend/tests/test_runtime_diagnostics.py`

- [ ] **Step 1: Add RED tests**

Add imports:

```python
from core.config import SessionSettings, build_arg_parser
```

Add helper:

```python
def make_settings(**overrides) -> SessionSettings:
    parser = build_arg_parser()
    args = parser.parse_args([])
    settings = SessionSettings.from_args(args)
    settings.update_from_dict(overrides)
    return settings
```

Add tests:

```python
def test_api_mode_marks_local_llm_profile_optional(self) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        workspace_root = Path(temp_dir)
        payload = runtime_diagnostics_payload(
            {
                "services": {
                    "llm": {
                        "label": "Local LLM",
                        "command": "llama-server -m ${WORKSPACE_ROOT}/missing.gguf --port 8080",
                    }
                }
            },
            workspace_root=workspace_root,
            settings=make_settings(dialog_mode="api", api_llm_url="https://api.example.test/v1/chat/completions", api_llm_model="qwen-plus", api_llm_api_key="secret"),
            command_resolver=lambda command: None,
            port_checker=lambda port: True,
        )

    local_item = next(item for item in payload["items"] if item["role"] == "llm" and item["provider"] != "api")
    api_item = next(item for item in payload["items"] if item["role"] == "llm" and item["provider"] == "api")
    self.assertEqual(payload["mode"]["dialog"], "api")
    self.assertEqual(local_item["requirement"], "optional")
    self.assertEqual(local_item["status"], "warning")
    self.assertEqual(local_item["checks"][0]["metadata"]["original_status"], "error")
    self.assertEqual(api_item["requirement"], "required")
    self.assertEqual(api_item["status"], "ok")
    self.assertEqual(payload["status"], "warning")
```

```python
def test_api_mode_missing_llm_api_config_is_required_error(self) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        payload = runtime_diagnostics_payload(
            {"services": {}},
            workspace_root=Path(temp_dir),
            settings=make_settings(dialog_mode="api", api_llm_url="", api_llm_model="", api_llm_api_key=""),
        )

    api_item = next(item for item in payload["items"] if item["role"] == "llm" and item["provider"] == "api")
    self.assertEqual(api_item["requirement"], "required")
    self.assertEqual(api_item["status"], "error")
    self.assertEqual([check["kind"] for check in api_item["checks"]], ["api_url", "api_model", "api_key"])
    self.assertFalse(payload["ok"])
    self.assertEqual(payload["status"], "error")
```

```python
def test_local_mode_keeps_local_llm_profile_required_error(self) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        workspace_root = Path(temp_dir)
        payload = runtime_diagnostics_payload(
            {
                "services": {
                    "llm": {
                        "label": "Local LLM",
                        "command": "llama-server -m ${WORKSPACE_ROOT}/missing.gguf --port 8080",
                    }
                }
            },
            workspace_root=workspace_root,
            settings=make_settings(dialog_mode="local"),
            command_resolver=lambda command: None,
            port_checker=lambda port: True,
        )

    local_item = next(item for item in payload["items"] if item["role"] == "llm")
    self.assertEqual(local_item["requirement"], "required")
    self.assertEqual(local_item["status"], "error")
    self.assertEqual(payload["status"], "error")
```

```python
def test_runtime_diagnostics_route_includes_mode_metadata(self) -> None:
    class ServiceManagerStub:
        services = {
            "llm": {
                "label": "Local LLM",
                "command": "llama-server -m ./missing.gguf --port 8080",
            }
        }

    app = FastAPI()
    app.state.service_manager = ServiceManagerStub()
    app.state.settings = make_settings(dialog_mode="api", api_llm_url="https://api.example.test/v1/chat/completions", api_llm_model="qwen-plus", api_llm_api_key="secret")
    app.include_router(create_diagnostics_router())

    response = TestClient(app).get("/api/diagnostics/runtime")

    self.assertEqual(response.status_code, 200)
    payload = response.json()
    self.assertEqual(payload["mode"]["dialog"], "api")
    self.assertTrue(any(item["provider"] == "api" and item["role"] == "llm" for item in payload["items"]))
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_runtime_diagnostics -v
```

Expected: fails because `runtime_diagnostics_payload()` does not accept `settings` and diagnostic items do not have `requirement`.

## Task 2: Implement Backend Mode Context

**Files:**
- Modify: `backend/diagnostics/runtime.py`
- Modify: `backend/api/diagnostics.py`

- [ ] **Step 1: Extend diagnostic dataclasses**

In `RuntimeDiagnosticCheck`, add:

```python
requirement: Literal["required", "optional"] = "required"
```

Include it in `to_dict()`.

In `RuntimeDiagnosticItem`, add:

```python
requirement: Literal["required", "optional"] = "required"
```

Include it in `to_dict()`.

- [ ] **Step 2: Add mode helpers**

Add:

```python
DiagnosticRequirement = Literal["required", "optional"]

@dataclass(frozen=True)
class RuntimeModeContext:
    dialog: str = "local"
    asr: str = "local"
    tts: str = "local"
    tts_enabled: bool = True
```

Add `mode_context_from_settings(settings)`, `mode_context_to_dict(context)`, `requirement_for_item(item, context)`, `apply_requirement(item, requirement)`, and `api_config_items(context, settings)`.

Mode rules:

- `llm` local service is required only when `dialog == "local"`.
- `llm` API config item is required only when `dialog == "api"`.
- `asr` local service is required only when `asr == "local"`; API config item is required only when `asr == "api"`.
- `tts` local service is required only when `tts_enabled` and `tts == "local"`; API config item is required only when `tts_enabled` and `tts == "api"`.
- `tool` items are required only for `provider == "python"`; `node`, `npm`, `ffmpeg`, `cuda`, and `openclaw` are optional in API quick mode.
- Optional items keep their checks but convert `error` to `warning` and set check metadata `original_status: "error"`.

- [ ] **Step 3: Extend runtime payload**

Change signature:

```python
def runtime_diagnostics_payload(..., settings: object | None = None, ...)
```

Build `mode_context`, evaluate service profiles, add API config items, apply requirements, and compute summary from adjusted items.

- [ ] **Step 4: Pass settings in route**

In `backend/api/diagnostics.py`, pass:

```python
settings=getattr(request.app.state, "settings", None),
```

to `runtime_diagnostics_payload`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_runtime_diagnostics -v
```

Expected: all runtime diagnostics tests pass.

## Task 3: Add Failing Frontend Structure Checks

**Files:**
- Modify: `frontend/scripts/check-ui-structure.mjs`

- [ ] **Step 1: Add checks**

Add assertions:

```js
assert(diagnosticsPage.includes("modeSummaryItems"), "运行诊断页需要显示当前 API/local 模式总览");
assert(diagnosticsPage.includes("requirementLabel") && diagnosticsPage.includes("API 模式下本地运行时为可选增强"), "运行诊断页需要解释必需项和可选本地增强");
assert(diagnosticsPage.includes("requiredIssueChecks") && diagnosticsPage.includes("optionalIssueChecks"), "运行诊断页需要区分阻塞问题和可选增强问题");
assert(diagnosticCheckList.includes("requirementLabel") && diagnosticCheckList.includes("diagnostic-check-requirement"), "运行诊断检查项需要显示必需/可选标签");
```

- [ ] **Step 2: Run check and verify RED**

Run:

```bash
cd frontend && npm run check:ui
```

Expected: fails until frontend rendering is updated.

## Task 4: Implement Frontend Mode-Aware Display

**Files:**
- Modify: `frontend/src/api/diagnostics.ts`
- Modify: `frontend/src/pages/DiagnosticsPage.vue`
- Modify: `frontend/src/components/diagnostics/DiagnosticCheckList.vue`

- [ ] **Step 1: Extend types**

Add:

```ts
export type DiagnosticRequirement = "required" | "optional";
```

Add `requirement: DiagnosticRequirement` to `RuntimeDiagnosticCheck` and `RuntimeDiagnosticItem`.

Add `mode` to `RuntimeDiagnostics`:

```ts
mode: {
  dialog: "local" | "api";
  asr: "local" | "api";
  tts: "local" | "api";
  tts_enabled: boolean;
};
```

- [ ] **Step 2: Render required vs optional**

In `DiagnosticsPage.vue`, add computed values:

```ts
const modeSummaryItems = computed(() => ...)
const requiredIssueChecks = computed(() => ...)
const optionalIssueChecks = computed(() => ...)
```

Update summary card text so `当前问题数量` uses required blockers first and optional enhancement issues second.

Add `requirementLabel(requirement)` and `requirementHint(check)`.

- [ ] **Step 3: Render check requirement labels**

In `DiagnosticCheckList.vue`, render:

```vue
<span class="diagnostic-check-requirement" :class="check.requirement">{{ requirementLabel(check.requirement) }}</span>
```

and explain optional issues with concise text.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
cd frontend && npm run check:ui
cd frontend && npm run check
cd frontend && npm run build
```

Expected: all pass.

## Task 5: Browser Verify, Commit, Push

**Files:**
- Same as Task 2 and Task 4.

- [ ] **Step 1: Browser verify**

Open:

```text
http://127.0.0.1:5173/app/diagnostics
```

Check:

- active mode appears near the top.
- required blockers and optional local enhancements are visually separate.
- local model/path/CUDA/OpenClaw warnings in API mode do not look like fatal blockers.
- no horizontal overflow at desktop or mobile width.

- [ ] **Step 2: Run final verification**

Run:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_runtime_diagnostics -v
cd frontend && npm run check:ui && npm run check && npm run build
git diff --check
```

- [ ] **Step 3: Commit and push**

Run:

```bash
git add backend/diagnostics/runtime.py backend/api/diagnostics.py backend/tests/test_runtime_diagnostics.py frontend/src/api/diagnostics.ts frontend/src/pages/DiagnosticsPage.vue frontend/src/components/diagnostics/DiagnosticCheckList.vue frontend/scripts/check-ui-structure.mjs
git commit -m "feat: make diagnostics mode aware"
git push origin main
```

## Self-Review

- Spec coverage: covers API quick mode, optional local runtime diagnostics, required API config checks, frontend separation of blockers and optional issues, verification, commit, and push.
- Placeholder scan: no TBD/TODO/fill-in-later steps remain.
- Type consistency: uses `requirement`, `mode`, `RuntimeModeContext`, `requiredIssueChecks`, `optionalIssueChecks`, and `modeSummaryItems` consistently across backend and frontend tasks.
