#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ports.sh
source "$SCRIPT_DIR/ports.sh"
cd "$SCRIPT_DIR/../backend"
exec uv run uvicorn app.main:app --reload --host 127.0.0.1 --port "${VITE_BACKEND_PORT:-$DEV_BACKEND_PORT}"
