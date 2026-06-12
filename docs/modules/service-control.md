# Service Control Module

## Responsibility

Controls local ASR, LLM, and TTS processes, checks health endpoints, records logs, and exposes service status to the API.

## Current Path

```text
backend/service_runtime/
```

## Main Files

- `services.py`
- `system_resources.py`

## Runtime Files

- `runtime/logs/asr.log`
- `runtime/logs/llm.log`
- `runtime/logs/tts.log`
- `runtime/service_profiles.json`

## Modification Notes

Service command fields are user-editable runtime configuration. Do not rename fields such as `cwd`, `command`, `health_url`, or startup timeout fields without migration.

Use `${PROJECT_ROOT}` for files inside the BranchWhisper repository and `${WORKSPACE_ROOT}` for sibling model/runtime folders. `BRANCHWHISPER_WORKSPACE_ROOT` can override the workspace root in a new environment. Legacy AutoDL absolute paths are rewritten to these tokens when profiles are loaded.
