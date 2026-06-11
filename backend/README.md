# Backend

The backend is the FastAPI application for BranchWhisper.

## Entry Point

```bash
python backend/main.py --host 127.0.0.1 --port 7860
```

## Responsibilities

- REST API routers
- WebSocket dialog endpoint
- ASR / LLM / TTS service control
- Dialog orchestration
- Runtime data access
- Weixin / OpenClaw integration runtime

## Stable Boundaries

Do not change these without an explicit migration plan:

- `/api/config`
- `/api/services`
- `/api/conversations`
- `/api/memory`
- `/api/tools`
- `/api/health`
- `/ws/dialog`

## Refactor Notes

Larger internal refactors, such as splitting `dialog/session.py` and `app/server.py`, should happen in smaller follow-up changes.
