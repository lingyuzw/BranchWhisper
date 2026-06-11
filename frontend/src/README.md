# Vue Source

`frontend/src/` contains the Vue 3 + Vite migration app.

The current production UI remains in:

```text
frontend/legacy-static/
```

Migration rule:

1. Keep `/api/*` and `/ws/dialog` unchanged.
2. Migrate low-risk pages first, such as services, settings, memory, and integrations.
3. Migrate the voice dialog page last because it owns microphone capture, WebSocket events, and audio playback.
4. Keep the legacy page working until the Vue page reaches feature parity.

Suggested structure:

```text
src/
  api/          typed API clients
  components/   shared layout and reusable UI
  pages/        route-level pages
  router/       Vue Router setup
  stores/       Pinia stores
  styles/       global design tokens and base layout
```
