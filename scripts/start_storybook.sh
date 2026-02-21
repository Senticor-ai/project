#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ports.sh
source "$SCRIPT_DIR/ports.sh"
cd "$SCRIPT_DIR/../frontend"
exec npx storybook dev --host "${PROJECT_PREFIX:-project}.localhost" -p "${STORYBOOK_PORT:-$DEV_STORYBOOK_PORT}" --no-open
