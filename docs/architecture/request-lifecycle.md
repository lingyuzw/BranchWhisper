# Request Lifecycle

## Static Page

```mermaid
sequenceDiagram
    participant Browser
    participant Backend

    Browser->>Backend: GET /
    Backend-->>Browser: frontend/legacy-static/index.html
    Browser->>Backend: GET /static/js/main.js
    Backend-->>Browser: static asset
```

## Dialog WebSocket

```mermaid
sequenceDiagram
    participant Browser
    participant WS as /ws/dialog
    participant Dialog
    participant ASR
    participant LLM
    participant TTS

    Browser->>WS: audio bytes or text event
    WS->>Dialog: normalized input
    Dialog->>ASR: audio transcription
    ASR-->>Dialog: text
    Dialog->>LLM: chat completion
    LLM-->>Dialog: assistant text
    Dialog->>TTS: synthesize audio
    TTS-->>Dialog: PCM chunks
    Dialog-->>Browser: text and audio events
```

## Service Control

The services page calls `/api/services/*`. The backend service manager starts or stops ASR, LLM, and TTS processes and writes logs to `runtime/logs/`.
