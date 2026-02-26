#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

IMAGE_TAG="${1:-project-openclaw-alpha:dev}"

echo "[openclaw-alpha] building image: $IMAGE_TAG"
docker build -t "$IMAGE_TAG" -f "$ROOT_DIR/openclaw/Dockerfile.alpha" "$ROOT_DIR"

cat <<EOF
[openclaw-alpha] build complete

Use this image for backend-managed OpenClaw containers:
  export OPENCLAW_IMAGE=$IMAGE_TAG

Then restart backend/worker so new starts use this image.
EOF
