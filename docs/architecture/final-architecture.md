# Final Architecture

BranchWhisper is now organized around runtime responsibility.

```mermaid
flowchart TD
    Root["BranchWhisper"]

    Root --> Backend["backend/ FastAPI backend"]
    Root --> Frontend["frontend/ browser UI"]
    Root --> Runtime["runtime/ user data"]
    Root --> Services["services/ standalone services"]
    Root --> Configs["configs/ service configs"]
    Root --> Scripts["scripts/ startup and checks"]
    Root --> Docs["docs/ architecture and modules"]

    Backend --> API["api/ REST routers"]
    Backend --> Dialog["dialog/ WebSocket session"]
    Backend --> ServiceRuntime["service_runtime/ ASR LLM TTS control"]
    Backend --> Integrations["integration_runtime/ OpenClaw Weixin"]
    Backend --> Media["media/ images stickers avatars"]
    Backend --> Tools["tools/ memory and tools"]

    Frontend --> Legacy["legacy-static/ current SPA"]
    Frontend --> VueSrc["src/ future Vue app"]

    API --> Runtime
    Dialog --> Runtime
    ServiceRuntime --> Services
```

## Module Dependency

```mermaid
flowchart LR
    Browser["Browser"] --> Static["frontend/legacy-static"]
    Browser --> API["/api/*"]
    Browser --> WS["/ws/dialog"]

    API --> Backend["backend modules"]
    WS --> Dialog["backend/dialog"]

    Dialog --> Voice["backend/service_runtime"]
    Dialog --> Memory["backend/tools + runtime DB"]
    Dialog --> Media["backend/media"]
    Dialog --> Conversations["backend/data"]

    Backend --> Runtime["runtime/"]
    Integrations["backend/integration_runtime"] --> Dialog
```

## Data Flow

```mermaid
flowchart LR
    Input["Text / Audio / Integration Message"] --> Backend["backend"]
    Backend --> ASR["ASR"]
    Backend --> LLM["LLM"]
    Backend --> TTS["TTS"]
    Backend --> Store["runtime/"]
    TTS --> Output["Browser Audio / Integration Reply"]
    Store --> Frontend["Conversation / Memory / Assets UI"]
```

## Stable Boundaries

- `/api/*` remains unchanged.
- `/ws/dialog` remains unchanged.
- `/static/*` serves the legacy frontend.
- `/runtime/uploads/*` and `/runtime/stickers/*` remain public asset URLs.
## Runtime Compatibility

The runtime root is:

```text
runtime/
```
