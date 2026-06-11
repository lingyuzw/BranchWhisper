# Data Flow

BranchWhisper stores local user data under `runtime/` and uses JSON or SQLite depending on the feature.

```mermaid
flowchart TD
    Frontend["frontend"] --> API["backend/api"]
    Frontend --> WS["backend /ws/dialog"]

    API --> Stores["stores and managers"]
    WS --> Dialog["dialog session"]

    Dialog --> Conversations["conversation store"]
    Dialog --> Memory["memory store"]
    Dialog --> Media["media stores"]
    Dialog --> Services["ASR / LLM / TTS"]

    Conversations --> Runtime["runtime/"]
    Memory --> Runtime
    Media --> Runtime
    Services --> Logs["runtime/logs/"]
```

## Important Data

- Conversations: `runtime/conversations/`
- Memory: `runtime/memory.sqlite3`
- Settings: `runtime/settings.json`
- Service profiles: `runtime/service_profiles.json`
- Integrations: `runtime/integrations.json`
- Uploads: `runtime/uploads/`
- Stickers: `runtime/stickers/`
- Logs: `runtime/logs/`

Back up `runtime/` before risky migrations.
