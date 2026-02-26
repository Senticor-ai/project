#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ports.sh
source "$SCRIPT_DIR/ports.sh"
cd "$SCRIPT_DIR/../frontend"

# Avoid stale Vite prebundle cache ("Outdated Optimize Dep" 504s) after
# dependency or branch changes.
rm -rf \
  node_modules/.vite/frontend-dev \
  node_modules/.vite/frontend-dev_temp_* \
  node_modules/.vite/deps \
  node_modules/.vite/deps_temp_* \
  2>/dev/null || true

exec npx vite --force --host "${PROJECT_PREFIX:-project}.localhost" --port "${FRONTEND_PORT:-$DEV_FRONTEND_PORT}"
