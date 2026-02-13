#!/usr/bin/env bash
set -euo pipefail

MAIN_REF="origin/main"

if ! git rev-parse --verify "$MAIN_REF" >/dev/null 2>&1; then
  git fetch origin main --depth=1 >/dev/null 2>&1 || true
fi

if [ -n "${CI_MERGE_REQUEST_TARGET_BRANCH_SHA:-}" ]; then
  base="$CI_MERGE_REQUEST_TARGET_BRANCH_SHA"
elif git rev-parse --verify "$MAIN_REF" >/dev/null 2>&1; then
  base="$(git merge-base HEAD "$MAIN_REF")"
elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  base="HEAD~1"
else
  base="HEAD"
fi

changed_files="$(git diff --name-only "$base"...HEAD)"

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
