#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[preflight] checking docs drift"
bash "$ROOT_DIR/scripts/check-doc-drift.sh"

echo "[preflight] running frontend storybook tests"
cd "$ROOT_DIR/frontend"
STORYBOOK_TESTS=1 CI=1 npx vitest run --project=storybook
