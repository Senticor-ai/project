#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ports.sh
source "$SCRIPT_DIR/ports.sh"
cd "$SCRIPT_DIR/../agents"
exec uv run uvicorn app:app --reload --host 127.0.0.1 --port "${AGENTS_PORT:-$DEV_AGENTS_PORT}"
