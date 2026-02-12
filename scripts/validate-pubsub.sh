#!/usr/bin/env bash
# Validate Gmail Pub/Sub configuration using gcloud CLI.
# Reads settings from .env and checks topic, subscription, and IAM permissions.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Load .env ─────────────────────────────────────────────────────────────────
if [[ -f "$ROOT_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
    set +a
fi

PROJECT="${GMAIL_PUBSUB_PROJECT_ID:?GMAIL_PUBSUB_PROJECT_ID not set}"
TOPIC="${GMAIL_PUBSUB_TOPIC:?GMAIL_PUBSUB_TOPIC not set}"
SUBSCRIPTION="${GMAIL_PUBSUB_SUBSCRIPTION:?GMAIL_PUBSUB_SUBSCRIPTION not set}"
CREDENTIALS_FILE="${GMAIL_PUBSUB_CREDENTIALS_FILE:?GMAIL_PUBSUB_CREDENTIALS_FILE not set}"

# Resolve relative creds path against project root
if [[ ! "$CREDENTIALS_FILE" = /* ]]; then
    CREDENTIALS_FILE="$ROOT_DIR/$CREDENTIALS_FILE"
fi

GMAIL_PUBLISHER="serviceAccount:gmail-api-push@system.gserviceaccount.com"
FULL_SUB="projects/$PROJECT/subscriptions/$SUBSCRIPTION"

PASS=0
FAIL=0

ok()   { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

echo "Validating Gmail Pub/Sub configuration (project: $PROJECT)"
echo

# ── 1. Credentials file ──────────────────────────────────────────────────────
echo "1. Service account credentials"
if [[ -f "$CREDENTIALS_FILE" ]]; then
    SA_EMAIL=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['client_email'])" "$CREDENTIALS_FILE" 2>/dev/null || true)
    if [[ -n "$SA_EMAIL" ]]; then
        ok "Credentials file exists ($SA_EMAIL)"
    else
        fail "Credentials file exists but could not parse client_email"
    fi
else
    fail "Credentials file not found: $CREDENTIALS_FILE"
fi
echo

# ── 2. Topic exists ──────────────────────────────────────────────────────────
echo "2. Pub/Sub topic"
if gcloud pubsub topics describe "$TOPIC" --project="$PROJECT" &>/dev/null; then
    ok "Topic exists: $TOPIC"
else
    fail "Topic not found: $TOPIC"
fi
echo

# ── 3. Gmail publish permission on topic ──────────────────────────────────────
echo "3. Gmail publish permission on topic"
TOPIC_IAM=$(gcloud pubsub topics get-iam-policy "$TOPIC" --project="$PROJECT" --format=json 2>/dev/null || echo "{}")
if echo "$TOPIC_IAM" | python3 -c "
import json, sys
policy = json.load(sys.stdin)
for binding in policy.get('bindings', []):
    if 'pubsub.publisher' in binding.get('role','').lower():
        if '$GMAIL_PUBLISHER' in binding.get('members', []):
            sys.exit(0)
sys.exit(1)
" 2>/dev/null; then
    ok "gmail-api-push@system.gserviceaccount.com has Publisher role"
else
    fail "gmail-api-push@system.gserviceaccount.com missing Publisher role on topic"
    echo "    Fix: gcloud pubsub topics add-iam-policy-binding $TOPIC \\"
    echo "           --member=$GMAIL_PUBLISHER --role=roles/pubsub.publisher \\"
    echo "           --project=$PROJECT"
fi
echo

# ── 4. Subscription exists and points to topic ───────────────────────────────
echo "4. Pub/Sub subscription"
SUB_INFO=$(gcloud pubsub subscriptions describe "$FULL_SUB" --project="$PROJECT" --format=json 2>/dev/null || echo "")
if [[ -n "$SUB_INFO" ]]; then
    SUB_TOPIC=$(echo "$SUB_INFO" | python3 -c "import json,sys; print(json.load(sys.stdin).get('topic',''))" 2>/dev/null || true)
    if [[ "$SUB_TOPIC" == "$TOPIC" ]]; then
        ok "Subscription exists and points to correct topic"
    else
        fail "Subscription exists but points to wrong topic: $SUB_TOPIC (expected $TOPIC)"
    fi
else
    fail "Subscription not found: $FULL_SUB"
fi
echo

# ── 5. Service account has Subscriber role on subscription ────────────────────
echo "5. Service account Subscriber permission"
if [[ -n "$SA_EMAIL" ]]; then
    SUB_IAM=$(gcloud pubsub subscriptions get-iam-policy "$FULL_SUB" --project="$PROJECT" --format=json 2>/dev/null || echo "{}")
    SA_MEMBER="serviceAccount:$SA_EMAIL"
    if echo "$SUB_IAM" | python3 -c "
import json, sys
policy = json.load(sys.stdin)
for binding in policy.get('bindings', []):
    if 'pubsub.subscriber' in binding.get('role','').lower():
        if '$SA_MEMBER' in binding.get('members', []):
            sys.exit(0)
sys.exit(1)
" 2>/dev/null; then
        ok "$SA_EMAIL has Subscriber role on subscription"
    else
        # Check project-level IAM as fallback (role may be granted at project level)
        PROJECT_IAM=$(gcloud projects get-iam-policy "$PROJECT" --format=json 2>/dev/null || echo "{}")
        if echo "$PROJECT_IAM" | python3 -c "
import json, sys
policy = json.load(sys.stdin)
for binding in policy.get('bindings', []):
    if 'pubsub.subscriber' in binding.get('role','').lower():
        if '$SA_MEMBER' in binding.get('members', []):
            sys.exit(0)
sys.exit(1)
" 2>/dev/null; then
            ok "$SA_EMAIL has Subscriber role (project-level)"
        else
            fail "$SA_EMAIL missing Subscriber role"
            echo "    Fix: gcloud pubsub subscriptions add-iam-policy-binding $FULL_SUB \\"
            echo "           --member=$SA_MEMBER --role=roles/pubsub.subscriber \\"
            echo "           --project=$PROJECT"
        fi
    fi
else
    fail "Cannot check Subscriber role — SA email unknown"
fi
echo

# ── Summary ───────────────────────────────────────────────────────────────────
echo "─────────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"
if [[ $FAIL -gt 0 ]]; then
    echo "Fix the issues above and re-run this script."
    exit 1
else
    echo "All checks passed — Pub/Sub is ready."
fi
