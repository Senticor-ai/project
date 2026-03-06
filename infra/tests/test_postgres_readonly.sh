#!/usr/bin/env bash
# Integration test: verify postgres runs correctly with readOnlyRootFilesystem
# Requires: kubectl configured for local k3s (Rancher Desktop), namespace "project"
#
# Usage:
#   bash infra/tests/test_postgres_readonly.sh              # apply manifest + test
#   bash infra/tests/test_postgres_readonly.sh --skip-apply  # test only (pod already running)
set -euo pipefail

NAMESPACE="project"
POD="postgres-0"
OVERLAY="infra/k8s/overlays/local/"
SKIP_APPLY=false
PASS=0
FAIL=0

[[ "${1:-}" == "--skip-apply" ]] && SKIP_APPLY=true

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== Postgres readOnlyRootFilesystem integration test ==="
echo ""

# --- Step 1: Apply manifest and wait for rollout ---
if [ "$SKIP_APPLY" = false ]; then
  echo "1. Applying kustomize overlay..."
  kubectl apply -k "$OVERLAY" >/dev/null 2>&1

  echo "2. Restarting postgres statefulset..."
  kubectl rollout restart statefulset/postgres -n "$NAMESPACE" >/dev/null 2>&1
  kubectl rollout status statefulset/postgres -n "$NAMESPACE" --timeout=120s >/dev/null 2>&1

  echo "3. Waiting for pod readiness..."
  kubectl wait --for=condition=Ready "pod/$POD" -n "$NAMESPACE" --timeout=60s >/dev/null 2>&1
else
  echo "1-3. Skipping apply (--skip-apply), checking pod is ready..."
  kubectl wait --for=condition=Ready "pod/$POD" -n "$NAMESPACE" --timeout=60s >/dev/null 2>&1
fi
echo ""

# --- Step 2: Security context assertions ---
echo "4. Security context checks:"

readonly_fs=$(kubectl get pod "$POD" -n "$NAMESPACE" \
  -o jsonpath='{.spec.containers[0].securityContext.readOnlyRootFilesystem}')
if [ "$readonly_fs" = "true" ]; then
  pass "readOnlyRootFilesystem is true"
else
  fail "readOnlyRootFilesystem is '$readonly_fs' (expected 'true')"
fi

volumes=$(kubectl get pod "$POD" -n "$NAMESPACE" -o jsonpath='{.spec.volumes[*].name}')
if echo "$volumes" | grep -q "postgres-run"; then
  pass "emptyDir volume 'postgres-run' exists"
else
  fail "emptyDir volume 'postgres-run' missing (volumes: $volumes)"
fi
if echo "$volumes" | grep -q "postgres-tmp"; then
  pass "emptyDir volume 'postgres-tmp' exists"
else
  fail "emptyDir volume 'postgres-tmp' missing (volumes: $volumes)"
fi
echo ""

# --- Step 3: Filesystem assertions ---
echo "5. Filesystem checks:"

if kubectl exec -n "$NAMESPACE" "$POD" -- sh -c "touch /test-readonly 2>/dev/null" 2>/dev/null; then
  fail "root filesystem is writable (expected read-only)"
  kubectl exec -n "$NAMESPACE" "$POD" -- rm -f /test-readonly 2>/dev/null
else
  pass "root filesystem is read-only"
fi

if kubectl exec -n "$NAMESPACE" "$POD" -- \
  sh -c "touch /var/run/postgresql/_test && rm /var/run/postgresql/_test" 2>/dev/null; then
  pass "/var/run/postgresql is writable"
else
  fail "/var/run/postgresql is not writable"
fi

if kubectl exec -n "$NAMESPACE" "$POD" -- \
  sh -c "touch /tmp/_test && rm /tmp/_test" 2>/dev/null; then
  pass "/tmp is writable"
else
  fail "/tmp is not writable"
fi
echo ""

# --- Step 4: Database operation assertions ---
echo "6. Database operation checks:"

db_user=$(kubectl get configmap app-config -n "$NAMESPACE" -o jsonpath='{.data.POSTGRES_USER}')
db_name=$(kubectl get configmap app-config -n "$NAMESPACE" -o jsonpath='{.data.POSTGRES_DB}')

if kubectl exec -n "$NAMESPACE" "$POD" -- pg_isready -U "$db_user" -d "$db_name" >/dev/null 2>&1; then
  pass "pg_isready succeeds"
else
  fail "pg_isready failed"
fi

sql="CREATE TABLE IF NOT EXISTS _readonly_test (id serial PRIMARY KEY, val text);
INSERT INTO _readonly_test (val) VALUES ('readonly works');
SELECT val FROM _readonly_test;
DROP TABLE _readonly_test;"

result=$(kubectl exec -n "$NAMESPACE" "$POD" -- \
  psql -U "$db_user" -d "$db_name" -t -A -c "$sql" 2>&1)
if echo "$result" | grep -q "readonly works"; then
  pass "DDL + DML operations succeed"
else
  fail "database operations failed: $result"
fi
echo ""

# --- Summary ---
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
