# Integrations Module

## Responsibility

Handles external chat integrations, currently OpenClaw / Weixin personal-account bridge behavior.

## Current Path

```text
backend/integration_runtime/
```

## Main Files

- `manager.py`
- `openclaw_bridge.py`
- `weixin_media.py`
- `weixin_voice_sender.mjs`

## Runtime Files

- `runtime/integrations.json`
- `runtime/integration_media/`
- `runtime/logs/`

## Modification Notes

Bridge code should adapt external platform messages to BranchWhisper. Do not move full dialog business logic into bridge scripts.
