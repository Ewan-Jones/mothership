#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is not installed or not in PATH." >&2
  exit 1
fi

if [[ ! -d "node_modules" ]]; then
  echo "Installing dependencies..."
  bun install
fi

if [[ ! -f "web/dist/index.html" ]]; then
  echo "Building web assets..."
  bun run build:web
fi

echo "Starting RCS on ${RCS_HOST:-0.0.0.0}:${RCS_PORT:-3000}"
exec bun run start
