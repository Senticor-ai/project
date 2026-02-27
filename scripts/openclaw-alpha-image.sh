#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

IMAGE_TAG="${1:-project-openclaw-alpha:dev}"
CONTAINER_CLI="${CONTAINER_CLI:-}"

if [[ -z "$CONTAINER_CLI" ]]; then
  if command -v nerdctl >/dev/null 2>&1; then
    CONTAINER_CLI="nerdctl"
  elif command -v docker >/dev/null 2>&1; then
    CONTAINER_CLI="docker"
  else
    echo "[openclaw-alpha] neither nerdctl nor docker found in PATH" >&2
    exit 1
  fi
fi

echo "[openclaw-alpha] using runtime: $CONTAINER_CLI"
echo "[openclaw-alpha] building image: $IMAGE_TAG"
"$CONTAINER_CLI" build -t "$IMAGE_TAG" -f "$ROOT_DIR/openclaw/Dockerfile.alpha" "$ROOT_DIR"

cat <<EOF
[openclaw-alpha] build complete

Use this image for backend-managed OpenClaw containers:
  export OPENCLAW_IMAGE=$IMAGE_TAG
  export OPENCLAW_PULL_POLICY=never

Then restart backend/worker so new starts use this image.
EOF
