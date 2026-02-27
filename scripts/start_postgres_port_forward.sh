#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env so host/port overrides are respected.
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

AUTO_POSTGRES_PORT_FORWARD="${AUTO_POSTGRES_PORT_FORWARD:-1}"
KUBE_NAMESPACE="${KUBE_NAMESPACE:-project}"
PG_HOST="${POSTGRES_HOST:-localhost}"
PG_PORT="${POSTGRES_PORT:-5432}"

postgres_reachable() {
  (echo >"/dev/tcp/${PG_HOST}/${PG_PORT}") >/dev/null 2>&1
}

if postgres_reachable; then
  echo "[dev] postgres already reachable at ${PG_HOST}:${PG_PORT}; skipping kubectl port-forward"
  exit 0
fi

if [[ "$AUTO_POSTGRES_PORT_FORWARD" != "1" ]]; then
  echo "[dev] postgres is not reachable at ${PG_HOST}:${PG_PORT}" >&2
  echo "[dev] set AUTO_POSTGRES_PORT_FORWARD=1 or start port-forward manually" >&2
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "[dev] kubectl is required to auto-start postgres port-forward" >&2
  exit 1
fi

echo "[dev] starting postgres port-forward (namespace=${KUBE_NAMESPACE}, local=${PG_PORT}, remote=5432)"
exec kubectl -n "$KUBE_NAMESPACE" port-forward svc/postgres "${PG_PORT}:5432"
