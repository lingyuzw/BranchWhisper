#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONDA_BIN="${CONDA_BIN:-/home/me/miniconda3/bin/conda}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-7860}"

exec "$CONDA_BIN" run --no-capture-output -n qwen3-asr python "$APP_ROOT/web/web_server.py" \
  --host "$HOST" \
  --port "$PORT" \
  --service-config "$APP_ROOT/configs/voice_services.local.json"
