#!/usr/bin/env bash
set -euo pipefail

TARGET_BRANCH="${GITHUB_BASE_REF:-main}"
MAIN_REF="origin/${TARGET_BRANCH}"
diff_range=""

if ! git rev-parse --verify "$MAIN_REF" >/dev/null 2>&1; then
  git fetch origin "$TARGET_BRANCH" --depth=1 >/dev/null 2>&1 || true
fi

if [ -n "${CI_MERGE_REQUEST_TARGET_BRANCH_SHA:-}" ] && git rev-parse --verify "${CI_MERGE_REQUEST_TARGET_BRANCH_SHA}^{commit}" >/dev/null 2>&1; then
  diff_range="${CI_MERGE_REQUEST_TARGET_BRANCH_SHA}...HEAD"
elif git rev-parse --verify "$MAIN_REF" >/dev/null 2>&1; then
  if base="$(git merge-base HEAD "$MAIN_REF" 2>/dev/null)"; then
    diff_range="${base}...HEAD"
  else
    echo "WARN: could not compute merge-base with ${MAIN_REF}; falling back to direct branch diff."
    diff_range="${MAIN_REF}..HEAD"
  fi
elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  diff_range="HEAD~1...HEAD"
else
  diff_range="HEAD...HEAD"
fi

changed_files="$(git diff --name-only "$diff_range")"

if [ -z "$changed_files" ]; then
  echo "alembic policy check: no changed files"
  exit 0
fi

schema_changed=0
migration_changed=0

if echo "$changed_files" | grep -q '^backend/db/schema.sql$'; then
  schema_changed=1
fi

if echo "$changed_files" | grep -q '^backend/alembic/versions/.*\.py$'; then
  migration_changed=1
fi

if [ "$schema_changed" -eq 1 ] && [ "$migration_changed" -eq 0 ]; then
  echo "FAIL: backend/db/schema.sql changed without a matching Alembic revision."
  echo "Add a migration under backend/alembic/versions/ and keep schema updates migration-driven."
  exit 1
fi

echo "alembic policy check passed"
