# Frontend Module

## Responsibility

The frontend provides the browser UI for dialog, service control, memory, integrations, assets, and settings.

## Current Path

```text
frontend/legacy-static/
```

## Future Path

```text
frontend/src/
```

## Migration Rule

Migrate page by page. Start with lower-risk pages such as services and settings. Migrate the dialog page last because it owns audio recording, WebSocket events, and playback.

## Public Dependencies

- `/api/*`
- `/ws/dialog`
- `/runtime/uploads/*`
- `/runtime/stickers/*`
