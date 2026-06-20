# BranchWhisper Desktop Application Design

## Product Principle

BranchWhisper Desktop must be usable before it asks the user to build a full local AI runtime.

The default first-run path is API quick start. A user on a fresh Windows machine should be able to open the app, enter API credentials, test the connection, and start chatting without installing WSL, CUDA, conda, Qwen3 ASR, CosyVoice, llama.cpp, or local model files.

Local models are an enhancement path. The app should guide users toward WSL, conda, CUDA, Qwen3 ASR, CosyVoice, llama.cpp, and model directories only when they choose local runtime mode.

## Target Users

- Normal user: no local AI environment and wants to use the app immediately.
- Advanced user: has API keys and may later configure local models.
- Developer: runs from source with WSL, conda, local services, and the repository runtime directory.

## Runtime Modes

### API Quick Mode

API quick mode is the default onboarding path.

Required:

- Desktop app can open.
- Lightweight backend can start.
- User can configure at least one chat-completions compatible LLM API.
- User can save settings.
- User can open the conversation page.

Optional:

- ASR API for voice input.
- TTS API for voice output.
- Vision and sticker APIs.

Not required:

- WSL.
- Ubuntu.
- CUDA.
- conda.
- Qwen3 ASR.
- CosyVoice.
- llama.cpp.
- local model files.

### Local Runtime Mode

Local runtime mode is an advanced enhancement path.

Required:

- WSL Ubuntu or another supported Linux runtime.
- `qwen3-asr` conda environment.
- Python runtime for the backend.
- ffmpeg.
- CUDA or a declared CPU fallback.
- service profile configuration.
- local ASR, LLM, and TTS service commands.

Optional:

- Docker runtime.
- alternative local ASR/TTS providers.
- OpenClaw or other integration bridge services.

## System Architecture

```text
BranchWhisper Desktop
├─ Desktop shell
│  ├─ window, tray, app lifecycle
│  ├─ lightweight backend launch
│  ├─ port detection
│  ├─ log capture
│  └─ future updater
├─ FastAPI backend
│  ├─ /api/*
│  ├─ /ws/dialog
│  ├─ /runtime/uploads/*
│  ├─ /runtime/stickers/*
│  └─ /app/ production frontend shell
├─ Vue frontend
│  ├─ first-run wizard
│  ├─ conversation
│  ├─ services
│  ├─ diagnostics
│  ├─ integrations
│  ├─ memory
│  ├─ assets
│  └─ settings
├─ API runtime
│  ├─ LLM API
│  ├─ ASR API
│  └─ TTS API
└─ Local runtime
   ├─ WSL Ubuntu
   ├─ conda qwen3-asr
   ├─ Qwen3 ASR
   ├─ llama.cpp
   ├─ CosyVoice
   └─ OpenClaw / bridge services
```

The desktop shell must not own dialog logic. The backend remains the business boundary. The frontend continues to depend only on stable public surfaces:

```text
/api/*
/ws/dialog
/runtime/uploads/*
/runtime/stickers/*
```

## Startup Flow

```text
User opens BranchWhisper
→ desktop shell starts
→ shell finds or starts lightweight backend
→ shell waits for backend health
→ frontend loads /app/
→ frontend checks first-run state
→ no config: show first-run wizard
→ API config present: enter API quick mode
→ local config present: check local runtime status
→ local runtime failed: show non-blocking warning and offer API fallback
```

Local runtime failure must not prevent the app from opening.

## First-Run Wizard

The first screen shows two choices:

```text
Quick Start: Use API
Full Local: Configure local models
```

Quick Start is recommended and should be visually first.

### Quick Start Copy

```text
Use BranchWhisper without installing WSL, CUDA, conda, or local models.
Enter API credentials, test the connection, and start chatting.
```

### Full Local Copy

```text
Use local Qwen3 ASR, llama.cpp, and CosyVoice. Choose this if you already have local models or want an offline/private runtime.
```

## API Quick Wizard

The API wizard has four steps:

```text
1. Chat model
2. Speech recognition
3. Speech synthesis
4. Review and start
```

Speech recognition and speech synthesis can be skipped. Chat model cannot be skipped.

Each step uses the same panel structure:

```text
provider preset
API URL
model name
API key
test button
test result
repair hint
save and continue
```

The wizard writes to the existing config surface:

```text
dialog_mode = api
api_llm_url
api_llm_model
api_llm_api_key
api_temperature
api_max_tokens
api_history_turns

asr_provider_mode = api
api_asr_provider
api_asr_url
api_asr_model
api_asr_api_key
api_asr_language
api_asr_timeout

tts_provider_mode = api
api_tts_provider
api_tts_url
api_tts_model
api_tts_api_key
api_tts_voice_mode
api_tts_voice
api_tts_voice_id
api_tts_format
api_tts_sample_rate
```

## Local Runtime Wizard

The local runtime wizard is available from first-run, settings, services, and diagnostics.

Steps:

```text
1. Runtime choice
2. WSL check
3. Ubuntu check
4. conda check
5. qwen3-asr environment check
6. Python and ffmpeg check
7. CUDA / GPU check
8. model directory selection
9. service profile generation
10. service startup
11. diagnostics review
```

Every check shows:

```text
what this step does
why it is needed
current status
failure reason
recommended fix
copyable command
retry check button
details/log expansion
```

## Diagnostics Semantics

Diagnostics are mode-aware.

In API quick mode:

- LLM API is required.
- ASR API is required only if voice input is enabled.
- TTS API is required only if voice output is enabled.
- WSL, CUDA, conda, Qwen3 ASR, CosyVoice, and llama.cpp are optional enhancements.

In local runtime mode:

- WSL or supported Linux runtime is required.
- conda and `qwen3-asr` are required.
- CUDA is required unless the selected profile declares CPU fallback.
- local ASR/LLM/TTS services are required according to the selected service profile.

Diagnostics page sections:

```text
current mode required checks
optional local enhancements
voice pipeline
service status
runtime logs
repair recommendations
export report
```

Missing optional local enhancements must not be shown as fatal errors in API quick mode.

## Main Application Layout

The desktop app uses a restrained workbench layout:

```text
┌─────────────────────────────────────────────┐
│ Top bar: BranchWhisper / current mode / key status │
├──────────────┬──────────────────────────────┤
│ Navigation   │ Current page                 │
│ Conversation │                              │
│ Services     │                              │
│ Diagnostics  │                              │
│ Integrations │                              │
│ Memory       │                              │
│ Assets       │                              │
│ Settings     │                              │
├──────────────┴──────────────────────────────┤
│ Status bar: Backend / API / ASR / LLM / TTS  │
└─────────────────────────────────────────────┘
```

The style should be quiet, readable, and tool-like:

- light neutral background
- white content surfaces
- shallow borders
- light shadows
- consistent green/yellow/red/blue/gray state colors
- compact but readable typography
- no marketing hero
- no oversized gradients
- no decorative blobs
- no nested cards

## Conversation Page

The conversation page should feel like a chat app first and a diagnostic console second.

Layout:

```text
left: conversation list and concise runtime status
center: message stream
bottom: composer
right: optional drawer for context, tools, trace, and voice pipeline details
```

Rules:

- Do not put status cards below the composer.
- Keep detailed diagnostics out of the normal chat flow.
- Show concise errors with links to diagnostics.
- Allow switching to API mode if local services fail.

## Services Page

The services page manages local runtime services and explains API mode.

In API quick mode, local service cards show:

```text
Optional enhancement. Current mode does not require this service.
```

In local runtime mode, service cards show:

```text
role
status
port
PID
health check
configured command
resolved command
start / stop / restart
view logs
copy command
```

## Settings Page

Settings should be grouped by user intent:

```text
Quick API mode
Local models
Voice
Memory
Tools
Integrations
Appearance
Advanced
```

Quick API mode appears first and includes:

- API chat model.
- API ASR.
- API TTS.
- test all API services.

Advanced and service command configuration remains available but should not be the first thing a normal user sees.

## Data Directory

Desktop application data should be separate from the installation directory.

Preferred desktop data root:

```text
~/.branchwhisper/runtime
```

Development mode may continue to use:

```text
BranchWhisper/runtime
```

Runtime data includes:

```text
settings.json
service_profiles.json
integrations.json
tool_providers.json
bot_profiles.json
tools.json
proactive_config.json
memory.sqlite3
proactive.sqlite3
reminders.sqlite3
conversations/
uploads/
stickers/
integration_media/
logs/
```

Model files are external user assets. They must not be committed to Git and should not be included in the initial desktop package.

## New Backend/Desktop Surfaces

Future desktop integration should add thin backend endpoints:

```text
/api/desktop/status
/api/desktop/mode
/api/desktop/runtime
/api/desktop/first-run
/api/desktop/setup-checks
```

These endpoints report app mode, runtime paths, first-run state, setup progress, and desktop/development context. They must not duplicate dialog or service business logic.

## Implementation Phases

1. Backend serves production frontend.
2. API quick start wizard.
3. Mode-aware diagnostics.
4. Desktop shell launches lightweight backend.
5. Local runtime wizard.
6. Local service management enhancements.
7. Windows packaging.

Each phase must be independently verified, committed, and pushed before the next phase starts.

## Acceptance Criteria

API quick mode passes when a fresh Windows computer with no WSL, CUDA, conda, or local models can:

```text
open the app
open first-run wizard
enter LLM API settings
test the LLM API
save settings
enter the conversation page
send and receive text messages
optionally configure ASR API for voice input
optionally configure TTS API for voice output
open diagnostics without local runtime missing items being fatal
```

Local runtime mode passes when the app can:

```text
detect WSL / Ubuntu
detect conda qwen3-asr
detect Python / ffmpeg
detect CUDA or declared CPU fallback
select model directories
generate service_profiles.json
start local ASR / LLM / TTS services
show service logs
show repair suggestions for failures
switch back to API mode when local runtime is unavailable
```

Desktop application mode passes when the app can:

```text
start by double-click
run without Vite dev server
start or find the backend
load /app/
avoid blank screens on backend failure
clean up child processes on close
preserve user runtime data
export a diagnostic report
```
