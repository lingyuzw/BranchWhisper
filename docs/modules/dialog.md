# Dialog Module

## Responsibility

The dialog module orchestrates a user turn: input, optional ASR, context, memory, tool execution, LLM reply, sticker choice, TTS, and persistence.

## Current Path

```text
backend/dialog/
```

## Main File

- `backend/dialog/session.py`

## Called By

- `backend/app/server.py` through `/ws/dialog`
- Integration runtime through its external dialog engine

## Dependencies

- `backend/service_runtime/`
- `backend/tools/`
- `backend/media/`
- `backend/data/`
- `backend/engagement/`

## Notes

`session.py` is intentionally not split in the first structure migration. Future refactors should separate WebSocket transport, dialog orchestration, memory tasks, and voice calls in small steps.
