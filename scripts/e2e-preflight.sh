#!/usr/bin/env bash
# E2E environment preflight check.
# Validates that all services required by Playwright E2E tests are running
# and reachable. Prints a clear pass/fail report for each prerequisite.
#
# Usage:
#   bash scripts/e2e-preflight.sh           # human-readable report
#   bash scripts/e2e-preflight.sh --quiet   # only print failures (for globalSetup)
#
# Environment:
#   E2E_SKIP_PREFLIGHT=1  Skip all checks (set by e2e-stack.sh which does its own health checks)
#
# Exit codes:
#   0 — all checks passed (or skipped via E2E_SKIP_PREFLIGHT)
#   1 — one or more checks failed
set -uo pipefail

# Allow e2e-stack.sh (and CI) to skip preflight — it already does its own health checks.
if [ "${E2E_SKIP_PREFLIGHT:-}" = "1" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

E2E_ENV_FILE="${ROOT_DIR}/.env.e2e"
DOCKER_COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
DOCKER_ENV_FILE="${ROOT_DIR}/.env"

QUIET=false
FAILURES=0
TOTAL=0

for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=true ;;
    -h|--help)
      echo "Usage: scripts/e2e-preflight.sh [--quiet]"
      echo ""
      echo "Validates that all E2E prerequisites are met before running Playwright."
      echo "  --quiet   Only print failures (for use as Playwright globalSetup)."
      echo ""
      echo "Environment:"
      echo "  E2E_SKIP_PREFLIGHT=1  Skip all checks (used by e2e-stack.sh / CI)."
      exit 0
      ;;
  esac
done

# ── Output helpers ──────────────────────────────────────────────────
pass() {
  TOTAL=$((TOTAL + 1))
  if [ "$QUIET" = false ]; then
    printf "[e2e-preflight]   %-35s \033[32mOK\033[0m\n" "$1"
  fi
}

fail() {
  TOTAL=$((TOTAL + 1))
  FAILURES=$((FAILURES + 1))
  printf "[e2e-preflight]   %-35s \033[31mFAIL\033[0m\n" "$1"
  printf "[e2e-preflight]     → %s\n" "$2"
}

# ── Check 1: .env.e2e ──────────────────────────────────────────────
if [ ! -f "$E2E_ENV_FILE" ]; then
  fail ".env.e2e" "Not found. Copy .env.example to .env.e2e and adjust."
  # Cannot continue without env — remaining checks depend on it.
  echo ""
  echo "[e2e-preflight] $FAILURES of $TOTAL checks failed."
  exit 1
else
  pass ".env.e2e"
fi

# ── Load environment & compute ports ───────────────────────────────
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

set -a
# shellcheck disable=SC1090
source "$E2E_ENV_FILE"
set +a

# shellcheck source=ports.sh
source "$SCRIPT_DIR/ports.sh"

BACKEND_PORT="$E2E_BACKEND_PORT"
AGENTS_PORT="$E2E_AGENTS_PORT"
FRONTEND_PORT="$E2E_FRONTEND_PORT"

PG_USER="${POSTGRES_USER:-project}"
PG_PASSWORD="${POSTGRES_PASSWORD:-changeme}"
PG_HOST="${POSTGRES_HOST:-localhost}"
PG_PORT="${POSTGRES_PORT:-5432}"
E2E_DB="${POSTGRES_DB:-${PROJECT_PREFIX//-/_}_e2e}"

if [ "$QUIET" = false ]; then
  echo "[e2e-preflight] Checking E2E environment (PORT_OFFSET=${PORT_OFFSET})..."
fi

# ── Check 2: PostgreSQL reachable ──────────────────────────────────
PSQL_CMD=""
POSTGRES_CONTAINER=""

detect_psql() {
  if command -v psql >/dev/null 2>&1; then
    PSQL_CMD="local"
  elif docker compose --env-file "$DOCKER_ENV_FILE" -f "$DOCKER_COMPOSE_FILE" ps --status running postgres 2>/dev/null | grep -q postgres; then
    PSQL_CMD="docker"
  elif POSTGRES_CONTAINER=$(docker ps --filter "ancestor=postgres:16" --filter "publish=5432" --format '{{.Names}}' 2>/dev/null | head -1) && [ -n "$POSTGRES_CONTAINER" ]; then
    PSQL_CMD="docker-direct"
  else
    PSQL_CMD=""
  fi
}

run_psql_admin() {
  local db="$1"; shift
  if [ "$PSQL_CMD" = "local" ]; then
    PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db" "$@" 2>/dev/null
  elif [ "$PSQL_CMD" = "docker-direct" ]; then
    docker exec -i "$POSTGRES_CONTAINER" psql -U "$PG_USER" -d "$db" "$@" 2>/dev/null
  elif [ "$PSQL_CMD" = "docker" ]; then
    docker compose --env-file "$DOCKER_ENV_FILE" -f "$DOCKER_COMPOSE_FILE" exec -T \
      postgres psql -U "$PG_USER" -d "$db" "$@" 2>/dev/null
  else
    return 1
  fi
}

detect_psql

if [ -z "$PSQL_CMD" ]; then
  fail "PostgreSQL ($PG_HOST:$PG_PORT)" "No psql binary and no postgres container found. Start it: docker compose -f infra/docker-compose.yml up -d"
elif ! run_psql_admin postgres -c "SELECT 1;" >/dev/null 2>&1; then
  fail "PostgreSQL ($PG_HOST:$PG_PORT)" "Not reachable. Start it: docker compose -f infra/docker-compose.yml up -d"
else
  pass "PostgreSQL ($PG_HOST:$PG_PORT)"

  # ── Check 3: E2E database exists ──────────────────────────────────
  DB_EXISTS=$(run_psql_admin postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$E2E_DB'" 2>/dev/null || echo "")
  if [ "$DB_EXISTS" != "1" ]; then
    fail "E2E database ($E2E_DB)" "Does not exist. Run: bash scripts/e2e-stack.sh --no-test (creates it automatically)"
  else
    pass "E2E database ($E2E_DB)"
  fi
fi

# ── Check 4: Backend health ────────────────────────────────────────
if curl -sf "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
  pass "Backend (:$BACKEND_PORT/health)"
else
  fail "Backend (:$BACKEND_PORT/health)" "Not responding. Start the E2E stack: bash scripts/e2e-stack.sh --no-test"
fi

# ── Check 5: Agents health ─────────────────────────────────────────
if curl -sf "http://localhost:$AGENTS_PORT/health" >/dev/null 2>&1; then
  pass "Agents (:$AGENTS_PORT/health)"
else
  fail "Agents (:$AGENTS_PORT/health)" "Not responding. Start the E2E stack: bash scripts/e2e-stack.sh --no-test"
fi

# ── Check 6: Frontend reachable ────────────────────────────────────
if curl -sf "http://localhost:$FRONTEND_PORT/" >/dev/null 2>&1; then
  pass "Frontend (:$FRONTEND_PORT)"
else
  fail "Frontend (:$FRONTEND_PORT)" "Not responding. Start the E2E stack: bash scripts/e2e-stack.sh --no-test"
fi

# ── Check 7: Port conflict detection ──────────────────────────────
# Warn if E2E ports are bound by unexpected processes (e.g. dev-mode servers).
check_port_owner() {
  local port="$1"
  local expected_label="$2"

  if ! command -v lsof >/dev/null 2>&1; then
    return 0  # Skip if lsof not available
  fi

  local pid
  pid=$(lsof -ti ":$port" 2>/dev/null | head -1)
  if [ -z "$pid" ]; then
    return 0  # Port not bound — service check already caught this
  fi

  local cmd
  cmd=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")

  # Check for known dev-mode processes on E2E ports
  case "$cmd" in
    node)
      # Could be vite (frontend) — expected on frontend port
      if [ "$expected_label" = "frontend" ]; then
        return 0
      fi
      ;;
    python*|uvicorn)
      # Could be backend or agents — expected
      if [ "$expected_label" = "backend" ] || [ "$expected_label" = "agents" ]; then
        return 0
      fi
      ;;
  esac
}

check_port_owner "$FRONTEND_PORT" "frontend"
check_port_owner "$BACKEND_PORT" "backend"
check_port_owner "$AGENTS_PORT" "agents"

# ── Summary ────────────────────────────────────────────────────────
echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "[e2e-preflight] $FAILURES of $TOTAL checks failed."
  echo "[e2e-preflight] Fix the issues above, then re-run: bash scripts/e2e-preflight.sh"
  exit 1
else
  if [ "$QUIET" = false ]; then
    echo "[e2e-preflight] All $TOTAL checks passed."
  fi
  exit 0
fi
