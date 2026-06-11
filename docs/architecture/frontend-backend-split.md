# Frontend / Backend Split

BranchWhisper now separates application code by runtime responsibility.

```text
backend/   FastAPI backend and local service orchestration
frontend/  browser UI
runtime/   user data and generated files
services/  standalone local services
docs/      long-term developer documentation
```

## Backend

`backend/` owns APIs, WebSocket sessions, service control, memory, media, integrations, and runtime data access.

The backend entrypoint is:

```bash
python backend/main.py --host 127.0.0.1 --port 7860
```

## Frontend

`frontend/legacy-static/` contains the existing static SPA and is still served at `/static`.

The future Vue app should be added under:

```text
frontend/src/
```

The frontend may only depend on:

- `/api/*`
- `/ws/dialog`
- `/runtime/uploads/*`
- `/runtime/stickers/*`

It must not depend on backend Python paths.

## Entrypoint

Use `backend/main.py` for backend startup.
