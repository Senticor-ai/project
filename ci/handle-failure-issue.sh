#!/usr/bin/env bash
# ci/handle-failure-issue.sh
#
# Runs in after_script of every quality/test CI job.
# - On failure: creates a GitLab issue (or comments on an existing one).
# - On success: auto-closes any open issue for this job+branch.
#
# Required CI variable:
#   GITLAB_ISSUE_TOKEN  — Project Access Token with api scope (Developer role)
#
# Optional CI variable:
#   CI_ISSUE_BOT_DEFAULT_BRANCH_ONLY=false  — Re-enable branch-scoped issue tracking.
#
# Silently exits if the token is not set, so pipelines in forks or
# environments without the token are unaffected.

set -euo pipefail

# ── Guards ──────────────────────────────────────────────────────────

JOB_STATUS="${CI_JOB_STATUS:-unknown}"
TOKEN="${GITLAB_ISSUE_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "[issue-bot] GITLAB_ISSUE_TOKEN not set, skipping."
  exit 0
fi

if [ "$JOB_STATUS" != "failed" ] && [ "$JOB_STATUS" != "success" ]; then
  echo "[issue-bot] Job status is '${JOB_STATUS}', nothing to do."
  exit 0
fi

# ── Environment ─────────────────────────────────────────────────────

BRANCH="${CI_MERGE_REQUEST_SOURCE_BRANCH_NAME:-${CI_COMMIT_BRANCH:-unknown}}"
DEFAULT_BRANCH="${CI_DEFAULT_BRANCH:-main}"
API_BASE="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}"
AUTH_HEADER="PRIVATE-TOKEN: ${TOKEN}"
TRACK_DEFAULT_BRANCH_ONLY="${CI_ISSUE_BOT_DEFAULT_BRANCH_ONLY:-true}"
ISSUE_LABEL="ci-failure::${CI_JOB_NAME}"
ISSUE_SCOPE_BRANCH="$BRANCH"
if [ "$TRACK_DEFAULT_BRANCH_ONLY" = "true" ]; then
  ISSUE_SCOPE_BRANCH="$DEFAULT_BRANCH"
fi
ISSUE_TITLE="CI failure: ${CI_JOB_NAME} on ${ISSUE_SCOPE_BRANCH}"
ISSUE_LABELS="${ISSUE_LABEL},ci-failure"

# ── Ensure dependencies (curl + jq) ────────────────────────────────

ensure_deps() {
  local need_install=false
  if ! command -v jq &>/dev/null; then need_install=true; fi
  if ! command -v curl &>/dev/null; then need_install=true; fi

  if [ "$need_install" = true ]; then
    echo "[issue-bot] Installing missing dependencies..."
    apt-get update -qq 2>/dev/null
    apt-get install -y -qq curl jq 2>/dev/null || {
      echo "[issue-bot] apt-get install failed, aborting."
      exit 0
    }
  fi
}

ensure_deps

# ── Helper: URL-encode a string via jq ──────────────────────────────

urlencode() { printf '%s' "$1" | jq -sRr @uri; }

# ── Scope guard ──────────────────────────────────────────────────────

if [ "$TRACK_DEFAULT_BRANCH_ONLY" = "true" ] && [ "${CI_COMMIT_BRANCH:-}" != "$DEFAULT_BRANCH" ]; then
  echo "[issue-bot] Skipping non-default branch pipeline (${BRANCH}); tracking ${DEFAULT_BRANCH} only."
  exit 0
fi

# ── Failure path: create or comment ─────────────────────────────────

handle_failure() {
  local encoded_label
  encoded_label=$(urlencode "$ISSUE_LABEL")

  # Check for an existing open issue (exact title + label).
  local existing
  existing=$(curl -fsSLk \
    -H "$AUTH_HEADER" \
    "${API_BASE}/issues?labels=${encoded_label}&state=opened&per_page=100")

  local iid web_url
  iid=$(echo "$existing" | jq -r --arg title "$ISSUE_TITLE" \
    '.[] | select(.title == $title) | .iid' | head -n1)

  if [ -n "$iid" ] && [ "$iid" != "null" ]; then
    # ── Duplicate: add a comment instead ──
    web_url=$(echo "$existing" | jq -r --arg iid "$iid" \
      '.[] | select((.iid | tostring) == $iid) | .web_url' | head -n1)
    echo "[issue-bot] Open issue already exists: ${web_url}"

    local comment_body
    comment_body=$(jq -n \
      --arg pipeline "$CI_PIPELINE_URL" \
      --arg commit "$CI_COMMIT_SHORT_SHA" \
      --arg job_url "$CI_JOB_URL" \
      '{body: ("**Another failure detected**\n\n" +
        "- Pipeline: " + $pipeline + "\n" +
        "- Commit: `" + $commit + "`\n" +
        "- Job: " + $job_url)}')

    curl -fsSLk \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -X POST \
      -d "$comment_body" \
      "${API_BASE}/issues/${iid}/notes" > /dev/null

    echo "[issue-bot] Added comment to issue #${iid}."
    return
  fi

  # ── Fetch job log (last 100 lines, ANSI codes stripped) ──
  local job_log
  job_log=$(curl -fsSLk \
    -H "$AUTH_HEADER" \
    "${API_BASE}/jobs/${CI_JOB_ID}/trace" 2>/dev/null \
    | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' \
    | tail -100 \
    || echo "(Could not fetch job log)")

  # ── Build issue description ──
  local description
  description=$(jq -n \
    --arg job_name "$CI_JOB_NAME" \
    --arg job_url "$CI_JOB_URL" \
    --arg pipeline_url "$CI_PIPELINE_URL" \
    --arg pipeline_id "$CI_PIPELINE_ID" \
    --arg branch "$BRANCH" \
    --arg commit "$CI_COMMIT_SHORT_SHA" \
    --arg author "${CI_COMMIT_AUTHOR:-unknown}" \
    --arg source "${CI_PIPELINE_SOURCE:-unknown}" \
    --arg log "$job_log" \
    -r '
      "## CI Job Failure\n\n" +
      "| Field | Value |\n|-------|-------|\n" +
      "| **Job** | [" + $job_name + "](" + $job_url + ") |\n" +
      "| **Pipeline** | [#" + $pipeline_id + "](" + $pipeline_url + ") |\n" +
      "| **Branch** | `" + $branch + "` |\n" +
      "| **Commit** | `" + $commit + "` |\n" +
      "| **Author** | " + $author + " |\n" +
      "| **Trigger** | " + $source + " |\n\n" +
      "## Job Log (last 100 lines)\n\n```\n" + $log + "\n```\n\n" +
      "---\n_Created automatically by CI issue bot._"')

  # ── Create the issue ──
  local payload response new_url
  payload=$(jq -n \
    --arg title "$ISSUE_TITLE" \
    --arg description "$description" \
    --arg labels "$ISSUE_LABELS" \
    '{title: $title, description: $description, labels: $labels}')

  response=$(curl -fsSLk \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -X POST \
    -d "$payload" \
    "${API_BASE}/issues")

  new_url=$(echo "$response" | jq -r '.web_url // "unknown"')
  echo "[issue-bot] Created issue: ${new_url}"
}

# ── Success path: auto-close resolved issues ────────────────────────

handle_success() {
  local encoded_label
  encoded_label=$(urlencode "$ISSUE_LABEL")

  # Find open issues with the matching label
  local issues
  issues=$(curl -fsSLk \
    -H "$AUTH_HEADER" \
    "${API_BASE}/issues?labels=${encoded_label}&state=opened&per_page=100")

  # On default-branch success, close all open issues for this job label.
  # Otherwise, only close the exact issue for this branch scope.
  local iids
  if [ "$TRACK_DEFAULT_BRANCH_ONLY" = "true" ] && [ "${CI_COMMIT_BRANCH:-}" = "$DEFAULT_BRANCH" ]; then
    iids=$(echo "$issues" | jq -r '.[].iid')
  else
    iids=$(echo "$issues" | jq -r --arg title "$ISSUE_TITLE" \
      '.[] | select(.title == $title) | .iid')
  fi

  if [ -z "$iids" ]; then
    return
  fi

  local iid
  while IFS= read -r iid; do
    [ -z "$iid" ] && continue

    # Add a closing comment
    local comment
    comment=$(jq -n \
      --arg job_url "$CI_JOB_URL" \
      --arg commit "$CI_COMMIT_SHORT_SHA" \
      '{body: ("**Resolved** :white_check_mark:\n\n" +
        "Job passed in commit `" + $commit + "`: " + $job_url)}')

    curl -fsSLk \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -X POST \
      -d "$comment" \
      "${API_BASE}/issues/${iid}/notes" > /dev/null

    # Close the issue
    curl -fsSLk \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -X PUT \
      -d '{"state_event":"close"}' \
      "${API_BASE}/issues/${iid}" > /dev/null

    echo "[issue-bot] Closed issue #${iid} (job now passes)."
  done <<< "$iids"
}

# ── Main ────────────────────────────────────────────────────────────

if [ "$JOB_STATUS" = "failed" ]; then
  handle_failure
elif [ "$JOB_STATUS" = "success" ]; then
  handle_success
fi
