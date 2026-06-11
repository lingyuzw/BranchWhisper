# Frontend

The current production frontend lives in `frontend/legacy-static/` and is still served by FastAPI at `/static`.
The Vue migration app lives in `frontend/src/` and is served from `/app` after `npm run build`.

## Current State

- `legacy-static/index.html` is the current SPA shell.
- `legacy-static/js/pages/` contains page controllers.
- `legacy-static/js/api/` contains API clients.
- `legacy-static/css/` contains page and layout styles.

## Vue Migration Target

The Vue frontend uses Vue 3, Vite, TypeScript, Pinia, Vue Router, and `@lucide/vue`.
Until a page reaches feature parity, keep the existing legacy static page working.

Do not move the voice dialog page first.

The frontend should only depend on public backend boundaries:

- `/api/*`
- `/ws/dialog`
- `/runtime/uploads/*`
- `/runtime/stickers/*`

## Commands

```bash
cd frontend
npm install
npm run dev
npm run check
npm run build
```

Development server:

```text
http://127.0.0.1:5173
```

Built app through FastAPI:

```text
http://127.0.0.1:7860/app
```
