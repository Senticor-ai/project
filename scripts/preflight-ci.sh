#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "${PREFLIGHT_CI_STRICT_BACKEND:-0}" == "1" ]]; then
  echo "[preflight] running local gate with backend integration"
  PREFLIGHT_SCOPE_MODE=all PREFLIGHT_CACHE_MODE=off bash "$ROOT_DIR/scripts/preflight-local.sh" --with-backend-integration
else
  echo "[preflight] running local gate"
  PREFLIGHT_SCOPE_MODE=all PREFLIGHT_CACHE_MODE=off bash "$ROOT_DIR/scripts/preflight-local.sh"
fi

echo "[preflight] running frontend storybook tests"
cd "$ROOT_DIR/frontend"
STORYBOOK_TESTS=1 CI=1 npx vitest run --project=storybook
