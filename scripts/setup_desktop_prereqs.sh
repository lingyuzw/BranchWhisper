#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== BranchWhisper desktop prerequisites =="

if [[ "$(uname -s)" == "Linux" ]]; then
  echo "Installing Tauri Linux packages. sudo may ask for your password."
  sudo apt update
  sudo apt install -y \
    build-essential \
    curl \
    file \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    libxdo-dev
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "Cargo was not found. Installing Rust through rustup."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1090
  source "$HOME/.cargo/env"
fi

(cd apps/desktop && npm install)

node apps/desktop/src/preflight.mjs --format text

echo "Desktop prerequisites check finished."
