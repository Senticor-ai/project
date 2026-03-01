#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ports.sh
source "$SCRIPT_DIR/ports.sh"
cd "$SCRIPT_DIR/../frontend"

# Avoid stale Storybook optimize-deps cache ("Outdated Optimize Dep" 504s)
# after dependency/branch changes.
rm -rf \
  node_modules/.vite/storybook \
  node_modules/.vite/storybook_temp_* \
  2>/dev/null || true

exec npx storybook dev --host "${PROJECT_PREFIX:-project}.localhost" -p "${STORYBOOK_PORT:-$DEV_STORYBOOK_PORT}" --no-open
