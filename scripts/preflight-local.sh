#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_ROOT="$ROOT_DIR/.tmp"
LOCK_DIR="$LOCK_ROOT/preflight-local.lock"
CACHE_SCHEMA_VERSION="2"
CACHE_ROOT="$LOCK_ROOT/preflight-local-cache/v$CACHE_SCHEMA_VERSION"

WITH_BACKEND_INTEGRATION=0
SCOPE_MODE="${PREFLIGHT_SCOPE_MODE:-changed}"
CACHE_MODE="${PREFLIGHT_CACHE_MODE:-on}"
LOCK_MAX_WAIT_SECONDS="${PREFLIGHT_LOCK_MAX_WAIT_SECONDS:-0}"

CHANGED_FILE_LIST=""
CACHE_CONTEXT=""
GIT_CHANGE_BASE=""
CHANGE_SCOPE_RELIABLE=1

RUN_DOCS=0
RUN_FRONTEND=0
RUN_BACKEND=0
RUN_AGENTS=0

is_non_negative_int() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

hash_stdin() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    openssl dgst -sha256 | awk '{print $2}'
  fi
}

hash_file() {
  local file="$1"

  if [[ -f "$file" ]]; then
    if command -v shasum >/dev/null 2>&1; then
      shasum -a 256 "$file" | awk '{print $1}'
    elif command -v sha256sum >/dev/null 2>&1; then
      sha256sum "$file" | awk '{print $1}'
    else
      openssl dgst -sha256 "$file" | awk '{print $2}'
    fi
    return 0
  fi

  if [[ -L "$file" ]]; then
    printf 'symlink:%s\n' "$(readlink "$file")" | hash_stdin
    return 0
  fi

  if [[ -e "$file" ]]; then
    printf 'meta:%s\n' "$(ls -ld "$file")" | hash_stdin
    return 0
  fi

  printf 'deleted\n'
}

build_cache_context() {
  local node_version
  local npm_version
  local uv_version
  local python_version

  node_version="$(node -v 2>/dev/null || echo "none")"
  npm_version="$(npm -v 2>/dev/null || echo "none")"
  uv_version="$(uv --version 2>/dev/null || echo "none")"
  python_version="$(python3 --version 2>/dev/null || echo "none")"

  printf '%s\n' \
    "schema=$CACHE_SCHEMA_VERSION" \
    "node=$node_version" \
    "npm=$npm_version" \
    "uv=$uv_version" \
    "python=$python_version" \
    "script=$(hash_file "$SCRIPT_DIR/preflight-local.sh")" \
    "docs_script=$(hash_file "$SCRIPT_DIR/check-doc-drift.sh")"
}

usage() {
  cat <<'EOF_USAGE'
Usage: scripts/preflight-local.sh [--with-backend-integration] [--all | --changed]

Runs local checks that must pass before a change is considered done.

Options:
  --with-backend-integration  Also run backend non-unit integration tests
                              (`pytest -m "not unit"`). Requires local Postgres.
  --all                       Run full preflight regardless of changed files.
  --changed                   Run only checks impacted by changed files (default).

Environment:
  PREFLIGHT_BASE_REF               Override git base ref used for changed-file scoping.
  PREFLIGHT_SCOPE_MODE             `changed` (default) or `all`.
  PREFLIGHT_CACHE_MODE             `on` (default) or `off`.
  PREFLIGHT_LOCK_MAX_WAIT_SECONDS  0 waits indefinitely; positive value caps wait.
EOF_USAGE
}

acquire_lock() {
  mkdir -p "$LOCK_ROOT"

  local fib_a=5
  local fib_b=10
  local waited=0

  while true; do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      printf '%s\n' "$$" > "$LOCK_DIR/pid"
      return 0
    fi

    local lock_pid=""
    if [[ -f "$LOCK_DIR/pid" ]]; then
      lock_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    fi

    if [[ -n "$lock_pid" ]] && kill -0 "$lock_pid" 2>/dev/null; then
      local sleep_for="$fib_a"
      if (( sleep_for > 60 )); then
        sleep_for=60
      fi

      if [[ "$LOCK_MAX_WAIT_SECONDS" -gt 0 ]]; then
        local remaining_wait=$((LOCK_MAX_WAIT_SECONDS - waited))
        if (( remaining_wait <= 0 )); then
          echo "[preflight] lock wait exceeded ${LOCK_MAX_WAIT_SECONDS}s; exiting." >&2
          exit 75
        fi
        if (( sleep_for > remaining_wait )); then
          sleep_for="$remaining_wait"
        fi
      fi

      echo "[preflight] already running for this workspace (pid $lock_pid)." >&2
      echo "[preflight] waiting ${sleep_for}s before retrying lock acquisition." >&2
      sleep "$sleep_for"

      waited=$((waited + sleep_for))
      if [[ "$LOCK_MAX_WAIT_SECONDS" -gt 0 ]] && (( waited >= LOCK_MAX_WAIT_SECONDS )); then
        echo "[preflight] lock wait exceeded ${LOCK_MAX_WAIT_SECONDS}s; exiting." >&2
        exit 75
      fi

      local fib_next=$((fib_a + fib_b))
      fib_a="$fib_b"
      fib_b="$fib_next"
      continue
    fi

    echo "[preflight] found stale preflight lock; recovering." >&2
    rm -rf "$LOCK_DIR"
  done
}

release_lock() {
  if [[ -f "$LOCK_DIR/pid" ]]; then
    local lock_pid=""
    lock_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    if [[ -n "$lock_pid" ]] && [[ "$lock_pid" != "$$" ]]; then
      return 0
    fi
  fi

  rm -rf "$LOCK_DIR"
}

cleanup() {
  release_lock
  if [[ -n "$CHANGED_FILE_LIST" ]] && [[ -f "$CHANGED_FILE_LIST" ]]; then
    rm -f "$CHANGED_FILE_LIST"
  fi
}

collect_changed_files() {
  : > "$CHANGED_FILE_LIST"

  if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    CHANGE_SCOPE_RELIABLE=0
    return 0
  fi

  local base_ref="${PREFLIGHT_BASE_REF:-}"
  if [[ -z "$base_ref" ]]; then
    base_ref="$(git -C "$ROOT_DIR" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  fi
  if [[ -z "$base_ref" ]]; then
    base_ref="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
  fi

  local merge_base=""
  if [[ -n "$base_ref" ]] && git -C "$ROOT_DIR" rev-parse --verify "$base_ref" >/dev/null 2>&1; then
    merge_base="$(git -C "$ROOT_DIR" merge-base HEAD "$base_ref" 2>/dev/null || true)"
  fi

  if [[ -z "$merge_base" ]]; then
    CHANGE_SCOPE_RELIABLE=0
  else
    GIT_CHANGE_BASE="$merge_base"
    git -C "$ROOT_DIR" diff --name-only --diff-filter=ACDMRTUXB "$merge_base...HEAD" >> "$CHANGED_FILE_LIST" || true
  fi

  git -C "$ROOT_DIR" diff --name-only --diff-filter=ACDMRTUXB HEAD >> "$CHANGED_FILE_LIST" || true
  git -C "$ROOT_DIR" ls-files --others --exclude-standard >> "$CHANGED_FILE_LIST" || true

  sort -u "$CHANGED_FILE_LIST" -o "$CHANGED_FILE_LIST"
}

is_docs_path() {
  local path="$1"
  case "$path" in
    backend/README.md|frontend/src/docs/engineering/Deployment.mdx|scripts/check-doc-drift.sh)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_frontend_path() {
  local path="$1"
  case "$path" in
    frontend/*|package.json)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_backend_path() {
  local path="$1"
  case "$path" in
    backend/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_agents_path() {
  local path="$1"
  case "$path" in
    agents/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

build_scope_fingerprint() {
  local scope="$1"
  local found=0

  {
    printf 'scope=%s\n' "$scope"
    printf 'scope_mode=%s\n' "$SCOPE_MODE"
    printf '%s\n' "$CACHE_CONTEXT"

    while IFS= read -r rel_path; do
      [[ -z "$rel_path" ]] && continue

      case "$scope" in
        docs)
          is_docs_path "$rel_path" || continue
          ;;
        frontend)
          is_frontend_path "$rel_path" || continue
          ;;
        backend)
          is_backend_path "$rel_path" || continue
          ;;
        agents)
          is_agents_path "$rel_path" || continue
          ;;
        *)
          continue
          ;;
      esac

      found=1
      printf '%s:%s\n' "$rel_path" "$(hash_file "$ROOT_DIR/$rel_path")"
    done < "$CHANGED_FILE_LIST"

    if [[ "$found" == "0" ]]; then
      printf '__no_changes__\n'
    fi
  } | hash_stdin
}

build_step_fingerprint() {
  local scope_fingerprint="$1"
  local step_name="$2"

  {
    printf '%s\n' "$CACHE_CONTEXT"
    printf 'scope_fingerprint=%s\n' "$scope_fingerprint"
    printf 'step=%s\n' "$step_name"
    printf 'strict_backend=%s\n' "$WITH_BACKEND_INTEGRATION"
  } | hash_stdin
}

validate_frontend_sync_cache() {
  [[ -d "$ROOT_DIR/frontend/node_modules" ]]
}

validate_backend_sync_cache() {
  [[ -d "$ROOT_DIR/backend/.venv" ]]
}

validate_agents_sync_cache() {
  [[ -d "$ROOT_DIR/agents/.venv" ]]
}

run_step_cached() {
  local step_key="$1"
  local step_fingerprint="$2"
  local validator_fn="$3"
  shift 3

  if [[ "$CACHE_MODE" == "off" ]]; then
    "$@"
    return 0
  fi

  mkdir -p "$CACHE_ROOT"
  local cache_file="$CACHE_ROOT/${step_key}.sha256"

  if [[ -f "$cache_file" ]]; then
    local cached_fingerprint=""
    cached_fingerprint="$(cat "$cache_file" 2>/dev/null || true)"
    if [[ "$cached_fingerprint" == "$step_fingerprint" ]]; then
      if [[ -z "$validator_fn" ]] || "$validator_fn"; then
        echo "[preflight] cache hit: $step_key"
        return 0
      fi
      echo "[preflight] cache invalidated: $step_key (validation failed)"
    fi
  fi

  "$@"
  printf '%s\n' "$step_fingerprint" > "$cache_file"
}

compute_scopes() {
  if [[ "$SCOPE_MODE" == "all" ]]; then
    RUN_DOCS=1
    RUN_FRONTEND=1
    RUN_BACKEND=1
    RUN_AGENTS=1
    return 0
  fi

  while IFS= read -r rel_path; do
    [[ -z "$rel_path" ]] && continue

    if is_docs_path "$rel_path"; then
      RUN_DOCS=1
    fi
    if is_frontend_path "$rel_path"; then
      RUN_FRONTEND=1
    fi
    if is_backend_path "$rel_path"; then
      RUN_BACKEND=1
    fi
    if is_agents_path "$rel_path"; then
      RUN_AGENTS=1
    fi
  done < "$CHANGED_FILE_LIST"

  if [[ "$WITH_BACKEND_INTEGRATION" == "1" ]]; then
    RUN_BACKEND=1
  fi
}

run_in_frontend() {
  (
    cd "$ROOT_DIR/frontend"
    "$@"
  )
}

run_in_backend() {
  (
    cd "$ROOT_DIR/backend"
    "$@"
  )
}

run_in_agents() {
  (
    cd "$ROOT_DIR/agents"
    "$@"
  )
}

for arg in "$@"; do
  case "$arg" in
    --with-backend-integration)
      WITH_BACKEND_INTEGRATION=1
      ;;
    --all)
      SCOPE_MODE="all"
      ;;
    --changed)
      SCOPE_MODE="changed"
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

if [[ "$SCOPE_MODE" != "all" ]] && [[ "$SCOPE_MODE" != "changed" ]]; then
  echo "[preflight] invalid scope mode: $SCOPE_MODE (expected all|changed)" >&2
  exit 2
fi

if [[ "$CACHE_MODE" != "on" ]] && [[ "$CACHE_MODE" != "off" ]]; then
  echo "[preflight] invalid cache mode: $CACHE_MODE (expected on|off)" >&2
  exit 2
fi

if ! is_non_negative_int "$LOCK_MAX_WAIT_SECONDS"; then
  echo "[preflight] invalid PREFLIGHT_LOCK_MAX_WAIT_SECONDS: $LOCK_MAX_WAIT_SECONDS" >&2
  exit 2
fi

acquire_lock
trap cleanup EXIT INT TERM

CHANGED_FILE_LIST="$(mktemp "${TMPDIR:-/tmp}/preflight-local.changed.XXXXXX")"
collect_changed_files

if [[ "$SCOPE_MODE" == "changed" ]] && [[ "$CHANGE_SCOPE_RELIABLE" != "1" ]]; then
  echo "[preflight] unable to determine a reliable git base; falling back to full preflight."
  SCOPE_MODE="all"
fi

CACHE_CONTEXT="$(build_cache_context)"
compute_scopes

CHANGED_FILE_COUNT="$(wc -l < "$CHANGED_FILE_LIST" | tr -d '[:space:]')"
if [[ -z "$CHANGED_FILE_COUNT" ]]; then
  CHANGED_FILE_COUNT=0
fi

echo "[preflight] scope mode: $SCOPE_MODE"
if [[ -n "$GIT_CHANGE_BASE" ]]; then
  echo "[preflight] git change base: $GIT_CHANGE_BASE"
fi
echo "[preflight] changed files detected: $CHANGED_FILE_COUNT"

if [[ "$RUN_DOCS" != "1" ]] && [[ "$RUN_FRONTEND" != "1" ]] && [[ "$RUN_BACKEND" != "1" ]] && [[ "$RUN_AGENTS" != "1" ]]; then
  echo "[preflight] no impacted preflight scopes detected. exiting."
  exit 0
fi

if [[ "$RUN_DOCS" == "1" ]]; then
  DOCS_SCOPE_FINGERPRINT="$(build_scope_fingerprint "docs")"
  echo "[preflight] checking docs drift"
  run_step_cached \
    "docs-drift" \
    "$(build_step_fingerprint "$DOCS_SCOPE_FINGERPRINT" "docs-drift")" \
    "" \
    bash "$ROOT_DIR/scripts/check-doc-drift.sh"
else
  echo "[preflight] skipping docs drift (no relevant changes)"
fi

if [[ "$RUN_FRONTEND" == "1" ]]; then
  FRONTEND_SCOPE_FINGERPRINT="$(build_scope_fingerprint "frontend")"

  echo "[preflight] syncing frontend dependencies"
  run_step_cached \
    "frontend-sync" \
    "$(build_step_fingerprint "$FRONTEND_SCOPE_FINGERPRINT" "frontend-sync")" \
    "validate_frontend_sync_cache" \
    run_in_frontend npm ci --ignore-scripts --silent

  echo "[preflight] linting frontend"
  run_step_cached \
    "frontend-lint" \
    "$(build_step_fingerprint "$FRONTEND_SCOPE_FINGERPRINT" "frontend-lint")" \
    "" \
    run_in_frontend npm run lint

  echo "[preflight] typechecking frontend"
  run_step_cached \
    "frontend-typecheck" \
    "$(build_step_fingerprint "$FRONTEND_SCOPE_FINGERPRINT" "frontend-typecheck")" \
    "" \
    run_in_frontend npm run type-check

  echo "[preflight] running frontend unit tests"
  run_step_cached \
    "frontend-unit-tests" \
    "$(build_step_fingerprint "$FRONTEND_SCOPE_FINGERPRINT" "frontend-unit-tests")" \
    "" \
    run_in_frontend env CI=1 npx vitest run --project=unit

  echo "[preflight] building frontend (catches tsc -b + bundling issues)"
  run_step_cached \
    "frontend-build" \
    "$(build_step_fingerprint "$FRONTEND_SCOPE_FINGERPRINT" "frontend-build")" \
    "" \
    run_in_frontend npm run build

  echo "[preflight] smoke-testing Storybook indexing/build startup"
  run_step_cached \
    "frontend-storybook-smoke" \
    "$(build_step_fingerprint "$FRONTEND_SCOPE_FINGERPRINT" "frontend-storybook-smoke")" \
    "" \
    run_in_frontend npm run storybook -- --smoke-test

  echo "[preflight] running frontend storybook tests"
  run_step_cached \
    "frontend-storybook-tests" \
    "$(build_step_fingerprint "$FRONTEND_SCOPE_FINGERPRINT" "frontend-storybook-tests")" \
    "" \
    run_in_frontend env STORYBOOK_TESTS=1 CI=1 npx vitest run --project=storybook
else
  echo "[preflight] skipping frontend checks (no relevant changes)"
fi

if [[ "$RUN_BACKEND" == "1" ]]; then
  BACKEND_SCOPE_FINGERPRINT="$(build_scope_fingerprint "backend")"

  echo "[preflight] syncing backend dependencies"
  run_step_cached \
    "backend-sync" \
    "$(build_step_fingerprint "$BACKEND_SCOPE_FINGERPRINT" "backend-sync")" \
    "validate_backend_sync_cache" \
    run_in_backend uv sync --quiet --python 3.12 --all-groups --all-extras

  echo "[preflight] linting backend"
  run_step_cached \
    "backend-lint" \
    "$(build_step_fingerprint "$BACKEND_SCOPE_FINGERPRINT" "backend-lint")" \
    "" \
    run_in_backend uv run --python 3.12 ruff check .

  echo "[preflight] typechecking backend"
  run_step_cached \
    "backend-typecheck" \
    "$(build_step_fingerprint "$BACKEND_SCOPE_FINGERPRINT" "backend-typecheck")" \
    "" \
    run_in_backend uv run --python 3.12 mypy app/

  echo "[preflight] running backend alias smoke tests"
  run_step_cached \
    "backend-alias-smoke" \
    "$(build_step_fingerprint "$BACKEND_SCOPE_FINGERPRINT" "backend-alias-smoke")" \
    "" \
    run_in_backend uv run --python 3.12 python -m pytest tests/test_items_jsonld_aliases.py -q

  if [[ "$WITH_BACKEND_INTEGRATION" == "1" ]]; then
    echo "[preflight] running backend integration tests (not unit)"
    run_step_cached \
      "backend-integration" \
      "$(build_step_fingerprint "$BACKEND_SCOPE_FINGERPRINT" "backend-integration")" \
      "" \
      run_in_backend uv run --python 3.12 python -m pytest -m "not unit" -q --maxfail=3
  fi
else
  echo "[preflight] skipping backend checks (no relevant changes)"
fi

if [[ "$RUN_AGENTS" == "1" ]]; then
  AGENTS_SCOPE_FINGERPRINT="$(build_scope_fingerprint "agents")"

  echo "[preflight] syncing agents dependencies"
  run_step_cached \
    "agents-sync" \
    "$(build_step_fingerprint "$AGENTS_SCOPE_FINGERPRINT" "agents-sync")" \
    "validate_agents_sync_cache" \
    run_in_agents uv sync --quiet --python 3.12 --all-groups

  echo "[preflight] linting agents"
  run_step_cached \
    "agents-lint" \
    "$(build_step_fingerprint "$AGENTS_SCOPE_FINGERPRINT" "agents-lint")" \
    "" \
    run_in_agents uv run --python 3.12 ruff check .

  echo "[preflight] typechecking agents"
  run_step_cached \
    "agents-typecheck" \
    "$(build_step_fingerprint "$AGENTS_SCOPE_FINGERPRINT" "agents-typecheck")" \
    "" \
    run_in_agents uv run --python 3.12 mypy .
else
  echo "[preflight] skipping agents checks (no relevant changes)"
fi

echo "[preflight] done"
