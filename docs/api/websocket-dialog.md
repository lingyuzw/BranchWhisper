# WebSocket Dialog API

## Endpoint

```text
/ws/dialog
```

## Stability

This is a stable compatibility boundary. Do not change event names or binary audio behavior while restructuring directories.

## Current Behavior

- Browser sends audio frames as binary WebSocket messages.
- Browser sends control and text messages as JSON.
- Backend sends JSON events for VAD, ASR, LLM deltas, assistant messages, errors, and metrics.
- Backend sends TTS audio as binary frames.

Document exact event schemas before changing the Vue dialog page.
