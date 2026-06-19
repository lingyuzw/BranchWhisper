# Refactor Roadmap

BranchWhisper has finished the staged structural split:

- `backend/`
- `frontend/`
- `runtime/`
- `services/`
- `docs/`

## Completed Rounds

- Round 2: `backend/` is the real backend.
- Round 3: root `runtime/` is the data directory.
- Round 4: `frontend/legacy-static/` carries the current UI; `frontend/src/` is reserved for Vue migration.
- Round 5: long-term docs, README, project rules, and final architecture diagrams are in place.
- Continuous optimization pass: runtime diagnostics expose resolved path evidence, frontend diagnostics use aligned repair rows, runtime JSON writes use the shared atomic writer, and this runbook records the full regression loop.

## Round 5 Cleanup Scope

This round keeps behavior stable and only closes structural gaps:

- Keep `backend/main.py` as the canonical backend entrypoint.
- Keep the current frontend in `frontend/legacy-static/`.
- Keep runtime user data under `runtime/`.
- Update project rules and documentation to point at the final architecture.

## Later Bug-Fix Track

Known runtime bugs should be fixed separately from directory cleanup. For example, `/api/integrations/dialog` returning `500` should be debugged from backend logs and reproduced with the exact integration payload.

## Later Refactor Track

Do these in small, independently verified steps:

1. Split `backend/app/server.py` into app factory, lifecycle, background tasks, and WebSocket registration.
2. Split `backend/dialog/session.py` into transport, orchestration, memory tasks, tools, media, and voice helpers.
3. Fold `backend/data/` into `backend/repositories/`.
4. Split `backend/service_runtime/` into `modules/voice/` and `modules/service_control/`.
5. Continue extracting large Vue pages into focused components only when a concrete page change needs that boundary.
6. Keep diagnostics and service profile logic provider-agnostic: model names belong in profile data, not conditional code.
