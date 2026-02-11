#!/usr/bin/env bash
# Dedicated E2E testing stack.
# Spins up a separate backend + frontend on alternate ports, backed by
# its own PostgreSQL database, runs Playwright tests, then tears down.
#
# Usage:
#   bash scripts/e2e-stack.sh            # run tests, tear down
#   bash scripts/e2e-stack.sh --no-test  # start stack, keep running
#   bash scripts/e2e-stack.sh --clean    # drop DB + storage on exit
#
# Playwright flags are forwarded, e.g.:
#   bash scripts/e2e-stack.sh --headed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

E2E_ENV_FILE="${ROOT_DIR}/.env.e2e"
SCHEMA_FILE="${ROOT_DIR}/backend/db/schema.sql"
BACKEND_PORT=8001
AGENTS_PORT=8002
FRONTEND_PORT=5174
E2E_DB="terminandoyo_e2e"

CLEAN_DB=false
RUN_TESTS=true
PW_ARGS=()
BACKEND_PID=""
WORKER_PID=""
AGENTS_PID=""
FRONTEND_PID=""

# ── Parse flags ──────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --clean)   CLEAN_DB=true ;;
    --no-test) RUN_TESTS=false ;;
    *)         PW_ARGS+=("$arg") ;;
  esac
done

# ── Load environment ─────────────────────────────────────────────────
# Source base .env first (postgres credentials), then E2E overrides.
# set -a / +a auto-exports every variable sourced.
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

if [ -f "$E2E_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$E2E_ENV_FILE"
  set +a
else
  echo "[e2e] ERROR: $E2E_ENV_FILE not found. Copy .env.example to .env.e2e and adjust."
  exit 1
fi

PG_USER="${POSTGRES_USER:-terminandoyo}"
PG_PASSWORD="${POSTGRES_PASSWORD:-changeme}"
PG_HOST="${POSTGRES_HOST:-localhost}"
PG_PORT="${POSTGRES_PORT:-5432}"

# ── Helper: run psql (local binary or docker exec) ──────────────────
DOCKER_COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
PSQL_CMD=""

detect_psql() {
  if command -v psql >/dev/null 2>&1; then
    PSQL_CMD="local"
  elif docker compose -f "$DOCKER_COMPOSE_FILE" ps --status running postgres 2>/dev/null | grep -q postgres; then
    PSQL_CMD="docker"
  else
    echo "[e2e] ERROR: No psql binary found and postgres container is not running."
    echo "[e2e] Install psql or start postgres: docker compose -f infra/docker-compose.yml up -d"
    exit 1
  fi
}

run_psql() {
  # run_psql <database> [extra psql args...]
  local db="$1"; shift
  if [ "$PSQL_CMD" = "local" ]; then
    PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db" "$@"
  else
    docker compose -f "$DOCKER_COMPOSE_FILE" exec -T \
      -e PGPASSWORD="$PG_PASSWORD" \
      postgres psql -U "$PG_USER" -d "$db" "$@"
  fi
}

# Admin psql — runs inside the container where the app user has superuser
# privileges (CREATEDB, etc.), bypassing host-level pg_hba restrictions.
run_psql_admin() {
  local db="$1"; shift
  docker compose -f "$DOCKER_COMPOSE_FILE" exec -T \
    postgres psql -U "$PG_USER" -d "$db" "$@"
}

# ── Cleanup on exit ──────────────────────────────────────────────────
cleanup() {
  local exit_code=$?
  echo ""
  echo "[e2e] Shutting down..."

  if [ -n "$FRONTEND_PID" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ -n "$AGENTS_PID" ]; then
    kill "$AGENTS_PID" 2>/dev/null || true
    wait "$AGENTS_PID" 2>/dev/null || true
  fi
  if [ -n "$WORKER_PID" ]; then
    kill "$WORKER_PID" 2>/dev/null || true
    wait "$WORKER_PID" 2>/dev/null || true
  fi
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi

  if [ "$CLEAN_DB" = true ]; then
    echo "[e2e] Dropping database $E2E_DB..."
    run_psql_admin postgres -c "DROP DATABASE IF EXISTS $E2E_DB;" 2>/dev/null || true
    echo "[e2e] Removing storage-e2e/..."
    rm -rf "$ROOT_DIR/storage-e2e"
  fi

  echo "[e2e] Done (exit $exit_code)."
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

# ── Step 1: Detect psql method ───────────────────────────────────────
detect_psql
echo "[e2e] Using psql via: $PSQL_CMD"

# ── Step 2: Check postgres connectivity ──────────────────────────────
echo "[e2e] Checking postgres at $PG_HOST:$PG_PORT..."
if ! run_psql_admin postgres -c "SELECT 1;" >/dev/null 2>&1; then
  echo "[e2e] ERROR: PostgreSQL not reachable."
  echo "[e2e] Start it with: docker compose -f infra/docker-compose.yml up -d"
  exit 1
fi

# ── Step 3: Create E2E database (idempotent) ─────────────────────────
echo "[e2e] Ensuring database '$E2E_DB' exists..."
DB_EXISTS=$(run_psql_admin postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$E2E_DB'" 2>/dev/null || echo "")
if [ "$DB_EXISTS" != "1" ]; then
  run_psql_admin postgres -c "CREATE DATABASE $E2E_DB OWNER $PG_USER;"
  echo "[e2e] Database created."
else
  echo "[e2e] Database already exists."
fi

# ── Step 4: Apply schema ─────────────────────────────────────────────
echo "[e2e] Applying schema..."
# Pipe via stdin so it works with both local psql and docker exec
run_psql "$E2E_DB" < "$SCHEMA_FILE" >/dev/null 2>&1
echo "[e2e] Schema applied."

# ── Step 5: Prepare environment ──────────────────────────────────────
export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${E2E_DB}"
export AGENTS_URL="http://localhost:${AGENTS_PORT}"
mkdir -p "$ROOT_DIR/storage-e2e"

# ── Step 6: Start backend ────────────────────────────────────────────
echo "[e2e] Starting backend on :$BACKEND_PORT..."
cd "$ROOT_DIR/backend"
uv run uvicorn app.main:app \
  --host 127.0.0.1 \
  --port "$BACKEND_PORT" \
  --log-level warning \
  &
BACKEND_PID=$!

# Wait for backend health
echo "[e2e] Waiting for backend health..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
    echo "[e2e] Backend ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[e2e] ERROR: Backend failed to start within 30s."
    exit 1
  fi
  sleep 1
done

# ── Step 6b: Start outbox worker ──────────────────────────────────────
# The worker processes outbox events (import jobs, search indexing, etc.).
# Without it, import jobs stay in "queued" status forever.
echo "[e2e] Starting outbox worker..."
cd "$ROOT_DIR/backend"
uv run python -m app.worker --loop &
WORKER_PID=$!
echo "[e2e] Worker started (PID $WORKER_PID)."

# ── Step 6c: Start agents service ─────────────────────────────────
# The agents service handles Tay chat tool execution. It calls the backend's
# POST /items to create items on behalf of the user.
echo "[e2e] Starting agents service on :$AGENTS_PORT..."
cd "$ROOT_DIR/agents"
BACKEND_URL="http://localhost:$BACKEND_PORT" \
  uv run uvicorn app:app \
    --host 127.0.0.1 \
    --port "$AGENTS_PORT" \
    --log-level warning \
    &
AGENTS_PID=$!

echo "[e2e] Waiting for agents health..."
for i in $(seq 1 15); do
  if curl -sf "http://localhost:$AGENTS_PORT/health" >/dev/null 2>&1; then
    echo "[e2e] Agents ready."
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "[e2e] ERROR: Agents service failed to start within 15s."
    exit 1
  fi
  sleep 1
done

# ── Step 7: Start frontend ───────────────────────────────────────────
echo "[e2e] Starting frontend on :$FRONTEND_PORT..."
cd "$ROOT_DIR/frontend"

# Tell vite.config.ts to proxy /api to the E2E backend port
export VITE_BACKEND_PORT="$BACKEND_PORT"

npx vite --port "$FRONTEND_PORT" --strictPort &
FRONTEND_PID=$!

# Wait for frontend
echo "[e2e] Waiting for frontend..."
for i in $(seq 1 20); do
  if curl -sf "http://localhost:$FRONTEND_PORT/" >/dev/null 2>&1; then
    echo "[e2e] Frontend ready."
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "[e2e] ERROR: Frontend failed to start within 20s."
    exit 1
  fi
  sleep 1
done

# ── Step 8: Run tests or keep running ────────────────────────────────
if [ "$RUN_TESTS" = true ]; then
  echo "[e2e] Running Playwright tests..."
  cd "$ROOT_DIR/frontend"
  E2E_BASE_URL="http://localhost:$FRONTEND_PORT" \
    npx playwright test --config e2e/playwright.config.ts "${PW_ARGS[@]+"${PW_ARGS[@]}"}"
else
  echo ""
  echo "[e2e] Stack is running. Press Ctrl-C to stop."
  echo "[e2e]   Frontend: http://localhost:$FRONTEND_PORT"
  echo "[e2e]   Backend:  http://localhost:$BACKEND_PORT"
  echo "[e2e]   Agents:   http://localhost:$AGENTS_PORT"
  echo "[e2e]   API docs: http://localhost:$BACKEND_PORT/docs"
  echo ""
  wait
fi
