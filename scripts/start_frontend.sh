#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ports.sh
source "$SCRIPT_DIR/ports.sh"
cd "$SCRIPT_DIR/../frontend"
exec npx vite --host "${PROJECT_PREFIX:-project}.localhost" --port "${FRONTEND_PORT:-$DEV_FRONTEND_PORT}"
