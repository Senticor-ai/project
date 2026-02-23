#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

WITH_BACKEND_INTEGRATION=0

usage() {
  cat <<'EOF'
Usage: scripts/preflight-local.sh [--with-backend-integration]

Runs local checks that must pass before a change is considered done.

Options:
  --with-backend-integration  Also run backend non-unit integration tests
                              (`pytest -m "not unit"`). Requires local Postgres.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --with-backend-integration)
      WITH_BACKEND_INTEGRATION=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[preflight] unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

echo "[preflight] checking docs drift"
bash "$ROOT_DIR/scripts/check-doc-drift.sh"

echo "[preflight] syncing frontend dependencies"
cd "$ROOT_DIR/frontend"
npm ci --ignore-scripts --silent

echo "[preflight] linting frontend"
npm run lint

echo "[preflight] typechecking frontend"
npm run type-check

echo "[preflight] building frontend (catches tsc -b + bundling issues)"
npm run build

echo "[preflight] syncing backend dependencies"
cd "$ROOT_DIR/backend"
uv sync --quiet --python 3.12 --all-groups --all-extras

echo "[preflight] linting backend"
uv run --python 3.12 ruff check .

echo "[preflight] typechecking backend"
uv run --python 3.12 mypy app/

echo "[preflight] running backend alias smoke tests"
uv run --python 3.12 python -m pytest tests/test_items_jsonld_aliases.py -q

if [[ "$WITH_BACKEND_INTEGRATION" == "1" ]]; then
  echo "[preflight] running backend integration tests (not unit)"
  uv run --python 3.12 python -m pytest -m "not unit" -q --maxfail=3
fi

echo "[preflight] syncing agents dependencies"
cd "$ROOT_DIR/agents"
uv sync --quiet --python 3.12 --all-groups

echo "[preflight] linting agents"
uv run --python 3.12 ruff check .

echo "[preflight] typechecking agents"
uv run --python 3.12 mypy .

echo "[preflight] done"
