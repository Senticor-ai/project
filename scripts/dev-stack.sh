#!/usr/bin/env bash
# Start the full dev stack with port isolation.
# Ports are computed from PORT_OFFSET (in .env, default 0).
#
# Usage:
#   bash scripts/dev-stack.sh          # or: cd frontend && npm run dev:stack
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env first (to get PORT_OFFSET and other vars)
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

# Compute ports
# shellcheck source=ports.sh
source "$SCRIPT_DIR/ports.sh"

# Export computed ports so all child processes see them
export VITE_BACKEND_PORT="$DEV_BACKEND_PORT"
export AGENTS_PORT="$DEV_AGENTS_PORT"
export STORYBOOK_PORT="$DEV_STORYBOOK_PORT"
export FRONTEND_PORT="$DEV_FRONTEND_PORT"
export WORKER_HEALTH_PORT="$DEV_WORKER_HEALTH_PORT"
export PUSH_WORKER_HEALTH_PORT="$DEV_PUSH_WORKER_HEALTH_PORT"
export GMAIL_WATCH_WORKER_HEALTH_PORT="$DEV_GMAIL_WATCH_WORKER_HEALTH_PORT"

# Export derived URLs
export VITE_API_BASE_URL="http://${PROJECT_PREFIX}.localhost:$DEV_BACKEND_PORT"
export AGENTS_URL="http://localhost:$DEV_AGENTS_PORT"
export BACKEND_URL="http://localhost:$DEV_BACKEND_PORT"
export CORS_ORIGINS="http://${PROJECT_PREFIX}.localhost:$DEV_FRONTEND_PORT,http://${PROJECT_PREFIX}.localhost:$DEV_STORYBOOK_PORT,http://localhost:$DEV_FRONTEND_PORT,http://localhost:$DEV_STORYBOOK_PORT"
export BACKEND_BASE_URL="http://localhost:$DEV_BACKEND_PORT"
export FRONTEND_BASE_URL="http://${PROJECT_PREFIX}.localhost:$DEV_FRONTEND_PORT"
export STORYBOOK_URL="http://${PROJECT_PREFIX}.localhost:$DEV_STORYBOOK_PORT"
export OPENROUTER_APP_URL="http://${PROJECT_PREFIX}.localhost:$DEV_FRONTEND_PORT"

echo "[dev] PORT_OFFSET=$PORT_OFFSET"
echo "[dev]   Frontend:  http://${PROJECT_PREFIX}.localhost:$DEV_FRONTEND_PORT"
echo "[dev]   Backend:   http://${PROJECT_PREFIX}.localhost:$DEV_BACKEND_PORT"
echo "[dev]   Agents:    http://localhost:$DEV_AGENTS_PORT"
echo "[dev]   Storybook: http://${PROJECT_PREFIX}.localhost:$DEV_STORYBOOK_PORT"
echo ""

cd "$ROOT_DIR/frontend"
exec npx concurrently -k \
  -n backend,worker,watch,agents,frontend,storybook \
  -c blue,magenta,yellow,green,cyan,white \
  "bash $SCRIPT_DIR/start_backend.sh" \
  "bash $SCRIPT_DIR/start_worker.sh" \
  "bash $SCRIPT_DIR/start_watch_worker.sh" \
  "bash $SCRIPT_DIR/start_agents.sh" \
  "bash $SCRIPT_DIR/start_frontend.sh" \
  "bash $SCRIPT_DIR/start_storybook.sh"
