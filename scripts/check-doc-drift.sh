#!/usr/bin/env bash
set -euo pipefail

fail=0

search_fixed() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -n --fixed-strings -- "$pattern" "$file"
  else
    grep -nF -- "$pattern" "$file"
  fi
}

expect_absent() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if search_fixed "$pattern" "$file" >/dev/null 2>&1; then
    echo "FAIL: $message"
    search_fixed "$pattern" "$file" || true
    fail=1
  fi
}

expect_present() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! search_fixed "$pattern" "$file" >/dev/null 2>&1; then
    echo "FAIL: $message"
    fail=1
  fi
}

# Backend API naming drift: routes are /items, not /things.
expect_absent "backend/README.md" "/things" "backend/README.md still references /things endpoints."
expect_present "backend/README.md" "/items" "backend/README.md should document /items endpoints."

# Deployment pipeline drift: CI is GitHub Actions with Buildx + commit-SHA tags on main.
expect_absent \
  "frontend/src/docs/engineering/Deployment.mdx" \
  "docker-compose.build.yml" \
  "Deployment docs still claim docker-compose.build.yml is used by CI."
expect_absent \
  "frontend/src/docs/engineering/Deployment.mdx" \
  'images are tagged `latest`' \
  "Deployment docs still claim latest image tagging on main."
expect_present \
  "frontend/src/docs/engineering/Deployment.mdx" \
  "Docker Buildx" \
  "Deployment docs should describe Docker Buildx-based CI image builds."
expect_present \
  "frontend/src/docs/engineering/Deployment.mdx" \
  "github.sha" \
  "Deployment docs should describe commit-SHA image tags."
expect_present \
  "frontend/src/docs/engineering/Deployment.mdx" \
  "Dockerfile.storybook" \
  "Deployment docs should include the Storybook Dockerfile."

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "docs drift checks passed"
