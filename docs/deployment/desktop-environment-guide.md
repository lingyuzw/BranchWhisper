# Desktop Environment Guide

BranchWhisper Desktop has two startup paths.

## Path 1: API Quick Mode

Use this path on a new computer without WSL, CUDA, conda, Qwen ASR, CosyVoice, llama.cpp, or model files.

Required:

- BranchWhisper desktop app or source checkout.
- Network access to an OpenAI-compatible chat API.
- API URL, model name, and API key.

Not required:

- WSL or Ubuntu.
- CUDA or GPU drivers.
- Local model files.
- Qwen ASR, CosyVoice, llama.cpp, or OpenClaw.

Expected flow:

```text
open app
-> backend starts or repair screen appears
-> /app/setup opens
-> choose Quick Start: Use API
-> enter chat API settings
-> optionally add ASR/TTS APIs
-> save and start
```

If local runtime checks fail in API mode, treat them as optional warnings unless the active feature needs that local service.

## Path 2: Desktop Development Mode

Use this path when running the desktop shell from source.

Required:

- Node.js and npm.
- Rust and Cargo.
- Tauri CLI installed in `apps/desktop`.
- Python backend environment for the current development machine.

Current WSL development command:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python backend/main.py --host 127.0.0.1 --port 7860
```

Prepare desktop dependencies:

```bash
npm run desktop:preflight
cd apps/desktop
npm install
```

Run the shell after Rust/Cargo and Tauri are available:

```bash
cd apps/desktop
npm run dev
```

## Preflight Results

`npm run desktop:preflight` prints JSON.

Pass example:

```json
{
  "ok": true,
  "checks": []
}
```

Failure is still useful. For example, on a machine without Rust and Tauri CLI:

```json
{
  "ok": false,
  "checks": [
    {
      "name": "cargo",
      "ok": false,
      "fix": "Install Rust/Cargo before running the Tauri shell."
    },
    {
      "name": "tauri cli",
      "ok": false,
      "fix": "Install Tauri CLI or run npm install in apps/desktop after scaffold."
    }
  ]
}
```

Fix the failed required desktop-development checks, then run preflight again.

## What The Desktop Shell Must Not Do

- Do not require local models for API quick mode.
- Do not start ASR, LLM, TTS, CUDA, WSL, llama.cpp, Qwen ASR, CosyVoice, or OpenClaw automatically in API mode.
- Do not hide backend startup errors. Show the command, log path, likely cause, and repair hints.
- Do not duplicate dialog business logic in the shell. Keep dialog behavior in the FastAPI backend.
