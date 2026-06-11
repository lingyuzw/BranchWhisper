# BranchWhisper

BranchWhisper is a local-first AI voice assistant console. It connects browser audio, ASR, LLM, TTS, memory, tools, stickers, proactive messages, and optional Weixin/OpenClaw integrations into one local runtime.

Core flow:

```text
Browser mic -> WebSocket -> VAD -> ASR -> LLM -> TTS -> Browser playback
Weixin message -> OpenClaw bridge -> BranchWhisper dialog core -> text / voice reply
```

## Quick Start

```bash
python backend/main.py --host 127.0.0.1 --port 7860
```

The old entrypoint is still kept for compatibility:

```bash
python web/web_server.py --host 127.0.0.1 --port 7860
```

Open:

```text
http://127.0.0.1:7860
```

Common pages:

- Dialog: `http://127.0.0.1:7860`
- Services: `http://127.0.0.1:7860#services`
- Integrations: `http://127.0.0.1:7860#integrations`
- Memory: `http://127.0.0.1:7860#memory`
- Settings: `http://127.0.0.1:7860#settings`

## Project Structure

```text
BranchWhisper/
  backend/                    # FastAPI backend
    main.py                   # New backend entrypoint
    app/                      # App factory, lifecycle, background tasks
    api/                      # REST API routers
    core/                     # Config and shared utilities
    data/                     # Current data stores, to be folded into repositories later
    dialog/                   # WebSocket dialog session
    domain/                   # Shared paths and constants
    engagement/               # Proactive messages and reminders
    integration_runtime/      # OpenClaw / Weixin bridge runtime
    media/                    # Avatars, images, stickers, vision helpers
    repositories/             # Data access adapters
    service_runtime/          # ASR/LLM/TTS process control and audio pipeline
    services/                 # Backend helper services
    tools/                    # Memory and tool runtime
  frontend/
    legacy-static/            # Existing static SPA, still served at /static
  runtime/                    # User data and generated runtime files, ignored by Git
  services/
    tts/                      # Standalone TTS service
  configs/                    # Local service configuration templates
  scripts/                    # Startup and check scripts
  docs/                       # Long-term architecture and module docs
  web/                        # Compatibility wrapper for old entrypoint
```

## Runtime Data

Runtime data now lives at the repository root:

```text
runtime/
```

It contains settings, service profiles, conversations, memory databases, uploads, stickers, integration media, and service logs. Runtime data is ignored by Git, except `runtime/README.md`.

## Service Configuration

The settings page saves service profiles to:

```text
runtime/service_profiles.json
```

You can also start BranchWhisper with an explicit service config:

```bash
python backend/main.py --host 0.0.0.0 --port 7860 --service-config /path/to/service_profiles.json
```

Example profile:

```text
backend/service_profiles.example.json
```

## Weixin / OpenClaw Integration

The Weixin personal-account integration depends on Node.js, npm, OpenClaw, ffmpeg, and `silk-wasm`.

```bash
npm install -g openclaw
npm install -g @tencent-weixin/openclaw-weixin-cli
npm install -g silk-wasm
openclaw --version
```

If the web page cannot detect `node`, `npm`, or `openclaw`, make sure the shell that starts BranchWhisper has the right `PATH`.

## Development Checks

Run the lightweight checks after structural changes:

```bash
python -m compileall backend services
python scripts/check_static_imports.py
node --check frontend/legacy-static/js/main.js
node --check backend/integration_runtime/weixin_voice_sender.mjs
```

## Architecture Docs

Start here:

- `docs/architecture/overview.md`
- `docs/architecture/frontend-backend-split.md`
- `docs/architecture/runtime-files.md`
- `docs/modules/dialog.md`
- `docs/api/websocket-dialog.md`

## Naming

The project name is **BranchWhisper**. Older local paths, config keys, or notes may still mention `buding`, `LoveChoice`, or the Chinese name `枝语`; those are compatibility leftovers and should not be removed from runtime data without a migration plan.
