# Voice Module

## Responsibility

The voice runtime handles audio conversion, VAD, ASR transcription, TTS synthesis, and related helper cleanup.

## Current Path

```text
backend/service_runtime/
```

## Main Files

- `audio_pipeline.py`
- `vad.py`
- `services.py`

## Future Split

Later, split this into:

```text
backend/modules/voice/
backend/modules/service_control/
```

Keep this as a later step because service startup and dialog audio streaming are high-risk paths.
