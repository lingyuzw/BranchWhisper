# BranchWhisper Desktop Studio Design

## Product Decision

BranchWhisper.exe is a standalone desktop Studio, not a web page wrapper.

The desktop app must feel closer to a launcher/control application such as AstrBot Launcher than to a browser window. It owns onboarding, mode selection, environment checks, runtime start/stop, logs, diagnosis, and user guidance. The existing web console remains a backend-powered advanced surface during migration, but it is not the default desktop experience.

## Product Principle

BranchWhisper must be usable on a fresh Windows computer before the user installs local AI environments.

The first screen offers two paths:

```text
Use API
Configure Local Runtime
```

API mode is first, recommended, and immediately usable. Local runtime is an advanced path with guided checks for WSL, conda, CUDA, Python, Node, ffmpeg, llama.cpp, CosyVoice, Qwen ASR, OpenClaw, model paths, ports, and service commands.

## What AstrBot Launcher Teaches Us

BranchWhisper should borrow the product shape, not copy implementation details:

- A real desktop entry point, not "open a terminal and visit a URL".
- Clear instance/runtime status before the user touches advanced settings.
- Guided setup with repair commands and logs.
- Runtime isolation between application code, user data, and model assets.
- Start, stop, restart, update, backup, restore, and open folder actions.
- A friendly first-run path for users who do not understand the development environment.

BranchWhisper differs in one important way: API mode must work without local model installation.

## Target Users

- Normal user: wants to open an app, enter API credentials, connect WeChat, and use it.
- Advanced user: wants API mode now and local runtime later.
- Local model user: already has Qwen ASR, llama.cpp, CosyVoice, CUDA, and model files.
- Developer: runs from source and needs diagnostics, logs, and packaging tools.

## Desktop App Responsibilities

The desktop Studio owns:

- first-run onboarding
- API mode setup
- local runtime setup
- mode switching
- backend process lifecycle
- service lifecycle controls
- port detection and conflict handling
- runtime directory selection
- logs and diagnosis
- repair suggestions
- report export
- desktop shortcuts and packaged exe placement

The backend owns:

- dialog logic
- memory
- proactive behavior
- tools
- integrations
- API/provider configuration persistence
- health and diagnostic facts

The web console owns, during migration:

- advanced chat surface
- detailed diagnostics page
- advanced settings pages
- legacy feature pages not yet ported to desktop Studio

## Architecture

```text
BranchWhisper.exe
├─ Tauri desktop Studio
│  ├─ Studio UI: onboarding, mode selector, setup, logs, diagnostics
│  ├─ app state: selected mode, setup progress, window state
│  ├─ desktop commands: start/stop backend, open folders, copy commands
│  └─ embedded webview route only for advanced/legacy pages
├─ Packaged backend
│  ├─ FastAPI API surface
│  ├─ lightweight API-mode runtime
│  ├─ local service manager
│  └─ runtime data storage
├─ API runtime path
│  ├─ LLM API
│  ├─ optional ASR API
│  └─ optional TTS API
└─ Local runtime path
   ├─ WSL Ubuntu
   ├─ conda qwen3-asr
   ├─ Python / Node / ffmpeg
   ├─ CUDA or CPU fallback
   ├─ llama.cpp
   ├─ CosyVoice
   ├─ Qwen ASR
   └─ OpenClaw / WeChat bridge
```

The first screen must be a Studio-owned page. It must not automatically navigate to `/app/`.

## First-Run Flow

```text
User double-clicks BranchWhisper.exe
→ Studio window opens
→ Studio checks packaged backend status
→ if backend is missing or failed, show recovery panel with logs
→ if first run, show mode choice
→ API mode selected: run API wizard
→ local mode selected: run local environment wizard
→ setup passes: show Studio home dashboard
```

Backend failure must not produce a blank window. It must show the command, log path, failure reason, and a repair suggestion.

## Main Studio Layout

The application uses a desktop workbench layout:

```text
┌────────────────────────────────────────────────────────────┐
│ Top bar: BranchWhisper Studio | mode | backend | actions   │
├───────────────┬────────────────────────────────────────────┤
│ Navigation    │ Current Studio page                        │
│ Home          │                                            │
│ API Setup     │                                            │
│ Local Setup   │                                            │
│ WeChat        │                                            │
│ Persona       │                                            │
│ Conversations │                                            │
│ Tasks         │                                            │
│ Data          │                                            │
│ Logs          │                                            │
│ Diagnostics   │                                            │
│ Advanced Web  │                                            │
├───────────────┴────────────────────────────────────────────┤
│ Status bar: backend, API, ASR, LLM, TTS, WeChat, issues     │
└────────────────────────────────────────────────────────────┘
```

Style:

- calm desktop utility
- readable 14-16px body text
- white surfaces, shallow borders, light shadows
- consistent status colors: green normal, yellow warning, red error, gray unchecked, blue running
- no landing-page hero
- no decorative blobs
- no nested cards
- no giant marketing typography

## Home Dashboard

The home dashboard shows:

- current mode: API or Local
- backend status
- WeChat bridge status
- assistant readiness
- latest issue summary
- primary next action
- recent logs

The top priority is that a user can answer:

```text
Can I use it now?
If not, what is broken?
What should I click next?
```

## API Mode

API mode must not require WSL, CUDA, conda, local models, llama.cpp, CosyVoice, Qwen ASR, or OpenClaw.

Wizard steps:

```text
1. Choose provider preset
2. Configure chat model
3. Optional ASR API
4. Optional TTS API
5. Test and save
6. Start using
```

Required fields:

- LLM API URL
- LLM model
- LLM API key

Optional fields:

- ASR API URL, model, key, language
- TTS API URL, model, key, voice, format

The API wizard writes to the existing backend config keys:

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
tts_provider_mode = api
api_tts_provider
api_tts_url
api_tts_model
api_tts_api_key
api_tts_voice_mode
api_tts_voice
api_tts_format
```

API mode passes when a fresh Windows machine can configure an LLM API, test it, save it, enter the home dashboard, and send a text message without local runtime dependencies.

## Local Runtime Mode

Local mode is a guided setup path, not the default first-run path.

Wizard steps:

```text
1. Explain local requirements
2. Check Windows prerequisites
3. Check WSL and Ubuntu
4. Check conda
5. Check qwen3-asr environment
6. Check Python / Node / ffmpeg
7. Check CUDA or CPU fallback
8. Select model directories
9. Detect llama.cpp
10. Detect CosyVoice
11. Detect Qwen ASR
12. Configure OpenClaw / WeChat bridge
13. Generate service profile
14. Start services
15. Review diagnostics
```

Every check shows:

- status
- failure reason
- why it matters
- exact repair command
- copy button
- retry button
- log/details expansion

Local setup must support API fallback if a local dependency fails.

## WeChat Setup

WeChat setup is a Studio page, not just a link into the old web UI.

It shows:

- selected mode
- bridge type
- bridge URL
- login state
- last poll time
- send test message action
- receive test message action
- failure reason and repair suggestion

Advanced legacy controls may remain accessible through "Open Advanced Web Console" until migrated.

## Persona, Greeting, And Reminders

Studio must expose normal-user controls for:

- persona prompt
- speaking style
- fabrication prevention
- memory behavior
- morning greeting template
- weather city
- reminder behavior

Greeting rules:

- mention weather and temperature range when weather data exists
- mention umbrella only when rain conditions justify it
- mention reminders only when there are active reminders
- do not invent weather, reminders, or user facts
- avoid motivational filler

## Data And Logs

Studio pages:

- Conversations: recent conversations, WeChat conversations, export entry
- Data: memory, attachments, runtime files, backups
- Tasks: reminders, scheduled greetings, future tasks
- Logs: backend logs, service logs, bridge logs, copied commands
- Diagnostics: mode-aware checks and repair suggestions

The desktop app should never ask a normal user to search terminal output manually before showing a useful failure summary.

## Runtime Data Directory

Application installation and user data are separate.

Preferred user data root:

```text
%APPDATA%\BranchWhisper\runtime
```

Development mode may continue to use:

```text
BranchWhisper/runtime
```

Model files remain external user assets. They are never committed and are not bundled in the base installer.

## Packaging Requirement

The desktop artifact must be:

```text
C:\Users\Me\Desktop\BranchWhisper.exe
```

The app must:

- open by double-click
- avoid a visible terminal window
- show the Studio UI first
- start or reuse the packaged backend
- keep user runtime data across upgrades
- export diagnostics
- stop child processes cleanly when appropriate

## Migration Strategy

The project moves from "desktop shell around web console" to "desktop Studio with backend integration" in stages.

Stage 1 creates the standalone Studio shell and first-run mode choice.

Stage 2 implements API mode inside the Studio.

Stage 3 implements local runtime setup inside the Studio.

Stage 4 migrates WeChat, persona, reminders, data, logs, and diagnostics pages into Studio-owned surfaces.

Stage 5 keeps "Advanced Web Console" only for expert workflows that are not yet migrated.

## Acceptance Criteria

Desktop Studio passes when:

```text
BranchWhisper.exe opens to a Studio-owned UI, not /app/
the first screen offers API mode and Local mode
API mode works without WSL, CUDA, conda, local models, llama.cpp, CosyVoice, Qwen ASR, or OpenClaw
local mode gives guided checks and repair commands
backend failure shows a recovery screen instead of a blank page
logs and diagnostics are visible inside the app
advanced web console is optional and explicitly labeled
```

