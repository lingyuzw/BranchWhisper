# Frontend

The current frontend lives in `frontend/legacy-static/` and is still served by FastAPI at `/static`.

## Current State

- `legacy-static/index.html` is the current SPA shell.
- `legacy-static/js/pages/` contains page controllers.
- `legacy-static/js/api/` contains API clients.
- `legacy-static/css/` contains page and layout styles.

## Vue Migration Target

The planned Vue frontend should live under `frontend/src/` with Vue 3, Vite, and TypeScript. Until a page is migrated, keep the existing legacy static page working.

`frontend/src/README.md` is a placeholder for this migration track. Do not move the voice dialog page first.

The frontend should only depend on public backend boundaries:

- `/api/*`
- `/ws/dialog`
- `/runtime/uploads/*`
- `/runtime/stickers/*`
