# ASR/TTS API Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local/API mode selection, provider presets, diagnostics, and voice-profile configuration for ASR and TTS without breaking the existing local Qwen3-ASR and CosyVoice flows.

**Architecture:** Keep existing local endpoints as the default path. Add focused ASR/TTS client modules that route by provider mode, normalize secrets through `core.config`, and expose compact preset-driven controls in the settings page. Voice cloning is represented as a first-class profile configuration, with provider support surfaced explicitly so unsupported providers do not pretend to clone voices.

**Tech Stack:** FastAPI backend, httpx async clients, Vue 3/Vite frontend, existing unittest backend tests.

---

### Task 1: Backend Configuration

**Files:**
- Modify: `backend/core/config.py`
- Test: `backend/tests/test_audio_api_clients.py`

- [ ] Add failing tests for ASR/TTS local/API modes, active provider selectors, and secret masking.
- [ ] Add settings fields, CLI defaults, validation, secret update, and public masking.
- [ ] Verify local defaults remain unchanged.

### Task 2: ASR Provider Routing

**Files:**
- Modify: `backend/service_runtime/audio_pipeline.py`
- Test: `backend/tests/test_audio_api_clients.py`

- [ ] Add failing tests for OpenAI-compatible ASR request shape.
- [ ] Route local mode to existing Qwen3-ASR behavior.
- [ ] Route API mode to provider-specific requests.

### Task 3: TTS Provider Routing

**Files:**
- Create: `backend/service_runtime/tts_clients.py`
- Modify: `backend/dialog/session.py`
- Modify: `backend/integration_runtime/manager.py`
- Test: `backend/tests/test_audio_api_clients.py`

- [ ] Add failing tests for local CosyVoice payload, OpenAI TTS payload, and voice profile selection.
- [ ] Centralize TTS synthesis into reusable stream/file helpers.
- [ ] Keep browser audio output as PCM16 mono for now.

### Task 4: Diagnostics And Upload Surface

**Files:**
- Modify: `backend/api/diagnostics.py`
- Modify: `backend/api/config.py`
- Test: `backend/tests/test_audio_api_clients.py`

- [ ] Add ASR API and TTS API diagnostic endpoints.
- [ ] Add voice sample upload endpoint that stores a local voice profile sample and returns profile metadata.
- [ ] Make unsupported voice-clone providers return clear capability errors.

### Task 5: Frontend Settings

**Files:**
- Modify: `frontend/src/api/config.ts`
- Modify: `frontend/src/api/diagnostics.ts`
- Modify: `frontend/src/pages/SettingsPage.vue`
- Modify: `frontend/src/styles/pages/settings.css`

- [ ] Add ASR/TTS local/API segmented controls.
- [ ] Add provider presets without overwriting API keys.
- [ ] Add TTS default voice, voice clone, output format, and low-latency controls.
- [ ] Add inline ASR/TTS probe controls.

### Verification

- [ ] Run backend focused tests.
- [ ] Run frontend type/build checks.
- [ ] Start the app and verify the settings page visually if the dev server is available.
