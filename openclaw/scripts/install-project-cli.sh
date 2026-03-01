#!/usr/bin/env bash
set -euo pipefail

log() {
  printf "[project-cli-bootstrap] %s\n" "$*"
}

is_core_dir() {
  local dir="${1}"
  [[ -f "${dir}/package.json" ]] &&
    [[ -f "${dir}/package-lock.json" ]] &&
    [[ -f "${dir}/tsconfig.json" ]] &&
    [[ -d "${dir}/cli" ]] &&
    [[ -d "${dir}/client" ]] &&
    [[ -d "${dir}/serializers" ]] &&
    [[ -d "${dir}/validation" ]]
}

resolve_project_core_dir() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  local -a candidates=()
  if [[ -n "${PROJECT_CORE_DIR:-}" ]]; then
    candidates+=("${PROJECT_CORE_DIR}")
  fi
  candidates+=(
    "${script_dir}/../../packages/core"
    "/project/packages/core"
    "/project-parent/packages/core"
    "/workspace/packages/core"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if is_core_dir "${candidate}"; then
      printf "%s\n" "${candidate}"
      return 0
    fi
  done

  if [[ -d "/workspaces" ]]; then
    local discovered
    discovered="$(find /workspaces -maxdepth 4 -type f -path "*/packages/core/package.json" -print -quit 2>/dev/null || true)"
    if [[ -n "${discovered}" ]]; then
      dirname "${discovered}"
      return 0
    fi
  fi

  return 1
}

main() {
  if command -v project-cli >/dev/null 2>&1 && project-cli --help >/dev/null 2>&1; then
    log "project-cli already installed and healthy."
    return 0
  fi

  local core_dir
  if ! core_dir="$(resolve_project_core_dir)"; then
    log "Could not locate packages/core. Set PROJECT_CORE_DIR to continue."
    return 1
  fi

  local build_dir
  build_dir="$(mktemp -d /tmp/project-core-build.XXXXXX)"
  trap 'rm -rf "${build_dir:-}"' EXIT

  # Build from a temp workspace so bootstrap never mutates /workspace memory files.
  cp "${core_dir}/package.json" "${core_dir}/package-lock.json" "${core_dir}/tsconfig.json" "${build_dir}/"
  cp -R "${core_dir}/cli" "${core_dir}/client" "${core_dir}/serializers" "${core_dir}/validation" "${build_dir}/"

  (
    cd "${build_dir}"
    npm ci
    npm run build
    npm install -g .
  )

  project-cli --help >/dev/null
  log "project-cli installed from ${core_dir}."
}

main "$@"
