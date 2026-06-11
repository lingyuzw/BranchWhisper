# Memory Module

## Responsibility

Stores, searches, extracts, and manages assistant memory.

## Current Paths

```text
backend/tools/runtime_brain.py
backend/repositories/memory.py
```

## Runtime Files

- `runtime/memory.sqlite3`

## Notes

The name `runtime_brain.py` is historical. Future cleanup should split memory store logic from tool management, but not during directory migration.
