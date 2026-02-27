#!/usr/bin/env bash
# Start the full dev stack with port isolation.
# Ports are computed from PORT_OFFSET (in .env, default 0).
#
# Usage:
#   bash scripts/dev-stack.sh          # or: cd frontend && npm run dev:stack
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
POSTGRES_FORWARD_PID=""

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

AUTO_POSTGRES_PORT_FORWARD="${AUTO_POSTGRES_PORT_FORWARD:-1}"
DEV_AUTO_DB_INIT="${DEV_AUTO_DB_INIT:-1}"
KUBE_NAMESPACE="${KUBE_NAMESPACE:-project}"
PG_HOST="${POSTGRES_HOST:-localhost}"
PG_PORT="${POSTGRES_PORT:-5432}"

postgres_reachable() {
  (echo >"/dev/tcp/${PG_HOST}/${PG_PORT}") >/dev/null 2>&1
}

cleanup() {
  if [[ -n "$POSTGRES_FORWARD_PID" ]] && kill -0 "$POSTGRES_FORWARD_PID" >/dev/null 2>&1; then
    kill "$POSTGRES_FORWARD_PID" >/dev/null 2>&1 || true
    wait "$POSTGRES_FORWARD_PID" >/dev/null 2>&1 || true
  fi
}

start_postgres_forward_if_needed() {
  if postgres_reachable; then
    echo "[dev] postgres already reachable at ${PG_HOST}:${PG_PORT}"
    return 0
  fi

  if [[ "$AUTO_POSTGRES_PORT_FORWARD" != "1" ]]; then
    echo "[dev] postgres is not reachable at ${PG_HOST}:${PG_PORT}" >&2
    echo "[dev] set AUTO_POSTGRES_PORT_FORWARD=1 or start kubectl port-forward manually" >&2
    exit 1
  fi

  echo "[dev] starting postgres port-forward (namespace=${KUBE_NAMESPACE}, local=${PG_PORT}, remote=5432)"
  mkdir -p "$ROOT_DIR/.tmp"
  local pf_log="$ROOT_DIR/.tmp/postgres-port-forward.log"
  : >"$pf_log"
  echo "[dev] postgres port-forward logs: $pf_log"
  bash "$SCRIPT_DIR/start_postgres_port_forward.sh" >>"$pf_log" 2>&1 &
  POSTGRES_FORWARD_PID="$!"

  for _ in $(seq 1 30); do
    if postgres_reachable; then
      echo "[dev] postgres reachable at ${PG_HOST}:${PG_PORT}"
      return 0
    fi
    if ! kill -0 "$POSTGRES_FORWARD_PID" >/dev/null 2>&1; then
      echo "[dev] postgres port-forward exited before postgres became reachable" >&2
      wait "$POSTGRES_FORWARD_PID" || true
      exit 1
    fi
    sleep 1
  done

  echo "[dev] timeout waiting for postgres at ${PG_HOST}:${PG_PORT}" >&2
  exit 1
}

run_db_init_if_enabled() {
  if [[ "$DEV_AUTO_DB_INIT" != "1" ]]; then
    return 0
  fi

  echo "[dev] running backend migrations (app.db_init)"
  (
    cd "$ROOT_DIR/backend"
    uv run --python 3.12 python -m app.db_init
  )
}

trap cleanup EXIT INT TERM

echo "[dev] PORT_OFFSET=$PORT_OFFSET"
echo "[dev]   Frontend:  http://${PROJECT_PREFIX}.localhost:$DEV_FRONTEND_PORT"
echo "[dev]   Backend:   http://${PROJECT_PREFIX}.localhost:$DEV_BACKEND_PORT"
echo "[dev]   Agents:    http://localhost:$DEV_AGENTS_PORT"
echo "[dev]   Storybook: http://${PROJECT_PREFIX}.localhost:$DEV_STORYBOOK_PORT"
echo "[dev]   Postgres:  localhost:${PG_PORT}"
echo ""

start_postgres_forward_if_needed
run_db_init_if_enabled

cd "$ROOT_DIR/frontend"
npx concurrently -k \
  -n backend,worker,watch,agents,frontend,storybook \
  -c blue,magenta,yellow,green,cyan,white \
  "bash $SCRIPT_DIR/start_backend.sh" \
  "bash $SCRIPT_DIR/start_worker.sh" \
  "bash $SCRIPT_DIR/start_watch_worker.sh" \
  "bash $SCRIPT_DIR/start_agents.sh" \
  "bash $SCRIPT_DIR/start_frontend.sh" \
  "bash $SCRIPT_DIR/start_storybook.sh"
