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

if [ -z "$changed_files" ]; then
  echo "alembic policy check: no changed files in diff range"
fi

python3 - <<'PY'
import ast
import os
import sys
from pathlib import Path

versions_dir = Path("backend/alembic/versions")
files = sorted(path for path in versions_dir.glob("*.py") if path.is_file())

if not files:
    print("FAIL: no Alembic revision files found under backend/alembic/versions/")
    sys.exit(1)

revision_to_file: dict[str, str] = {}
duplicates: dict[str, list[str]] = {}
referenced_down_revisions: set[str] = set()
missing_revision: list[str] = []


def _collect_down_refs(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, (list, tuple, set)):
        refs: list[str] = []
        for item in value:
            if isinstance(item, str) and item:
                refs.append(item)
        return refs
    return []


for path in files:
    source = path.read_text(encoding="utf-8")
    module = ast.parse(source, filename=str(path))
    values: dict[str, object] = {}

    for node in module.body:
        if not isinstance(node, ast.Assign):
            continue
        try:
            value = ast.literal_eval(node.value)
        except Exception:
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in {"revision", "down_revision"}:
                values[target.id] = value

    revision = values.get("revision")
    if not isinstance(revision, str) or not revision:
        missing_revision.append(path.name)
        continue

    if revision in revision_to_file:
        duplicates.setdefault(revision, [revision_to_file[revision]]).append(path.name)
    else:
        revision_to_file[revision] = path.name

    down_revision = values.get("down_revision")
    referenced_down_revisions.update(_collect_down_refs(down_revision))

if missing_revision:
    print("FAIL: missing/invalid `revision` in:")
    for name in missing_revision:
        print(f"  - {name}")
    sys.exit(1)

if duplicates:
    print("FAIL: duplicate Alembic revision IDs detected:")
    for revision, names in sorted(duplicates.items()):
        joined = ", ".join(sorted(names))
        print(f"  - {revision}: {joined}")
    sys.exit(1)

unknown_down_revisions = sorted(
    rev for rev in referenced_down_revisions if rev not in revision_to_file
)
if unknown_down_revisions:
    print("FAIL: unknown down_revision references detected:")
    for revision in unknown_down_revisions:
        print(f"  - {revision}")
    sys.exit(1)

heads = sorted(set(revision_to_file) - referenced_down_revisions)
allow_multi_heads = os.getenv("ALLOW_MULTI_ALEMBIC_HEADS") == "1"

if not heads:
    print("FAIL: no Alembic head detected.")
    sys.exit(1)

if len(heads) != 1 and not allow_multi_heads:
    print("FAIL: expected exactly one Alembic head, found:")
    for head in heads:
        print(f"  - {head} ({revision_to_file[head]})")
    print("Set ALLOW_MULTI_ALEMBIC_HEADS=1 only for intentional multi-branch migrations.")
    sys.exit(1)

print("alembic graph check passed")
print(f"  revisions: {len(revision_to_file)}")
print("  heads:")
for head in heads:
    print(f"    - {head} ({revision_to_file[head]})")
PY

echo "alembic policy check passed"
