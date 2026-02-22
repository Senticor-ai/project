#!/usr/bin/env bash
# ci/handle-failure-issue.sh
#
# Runs in after_script of every quality/test CI job.
# - On failure: creates a GitHub issue (or comments on an existing one).
# - On success: auto-closes any open issue for this job+branch.
#
# Required CI variable:
#   GITHUB_TOKEN  — token with Issues write permission on the target repository
#
# Optional CI variables:
#   GITHUB_REPOSITORY=owner/repo        — defaults to CI_PROJECT_PATH
#   CI_ISSUE_BOT_DEFAULT_BRANCH_ONLY=false  — re-enable branch-scoped issue tracking
#
# Silently exits if GITHUB_TOKEN is not set, so pipelines in forks or
# environments without token access are unaffected.

set -euo pipefail

# ── Guards ──────────────────────────────────────────────────────────

JOB_STATUS="${CI_JOB_STATUS:-unknown}"
TOKEN="${GITHUB_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "[issue-bot] GITHUB_TOKEN not set, skipping."
  exit 0
fi

if [ "$JOB_STATUS" != "failed" ] && [ "$JOB_STATUS" != "success" ]; then
  echo "[issue-bot] Job status is '${JOB_STATUS}', nothing to do."
  exit 0
fi

# ── Environment ─────────────────────────────────────────────────────

BRANCH="${CI_MERGE_REQUEST_SOURCE_BRANCH_NAME:-${CI_COMMIT_BRANCH:-unknown}}"
DEFAULT_BRANCH="${CI_DEFAULT_BRANCH:-main}"
TRACK_DEFAULT_BRANCH_ONLY="${CI_ISSUE_BOT_DEFAULT_BRANCH_ONLY:-true}"

ISSUE_SCOPE_BRANCH="$BRANCH"
if [ "$TRACK_DEFAULT_BRANCH_ONLY" = "true" ]; then
  ISSUE_SCOPE_BRANCH="$DEFAULT_BRANCH"
fi

ISSUE_TITLE="CI failure: ${CI_JOB_NAME} on ${ISSUE_SCOPE_BRANCH}"
ISSUE_TITLE_PREFIX="CI failure: ${CI_JOB_NAME} on "

REPO="${GITHUB_REPOSITORY:-}"
if [ -z "$REPO" ] && command -v git &>/dev/null; then
  ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
  if echo "$ORIGIN_URL" | grep -q "^https://github.com/"; then
    REPO="$(echo "$ORIGIN_URL" | sed -E 's|^https://github.com/||; s|\\.git$||')"
  elif echo "$ORIGIN_URL" | grep -q "^git@github.com:"; then
    REPO="$(echo "$ORIGIN_URL" | sed -E 's|^git@github.com:||; s|\\.git$||')"
  fi
fi
REPO="${REPO:-${CI_PROJECT_PATH:-Senticor-ai/project}}"
if ! echo "$REPO" | grep -Eq '^[^/]+/[^/]+$'; then
  echo "[issue-bot] Invalid repository '${REPO}', expected owner/repo."
  exit 0
fi

GITHUB_API_BASE="https://api.github.com/repos/${REPO}"
AUTH_HEADER="Authorization: Bearer ${TOKEN}"
ACCEPT_HEADER="Accept: application/vnd.github+json"
API_VERSION_HEADER="X-GitHub-Api-Version: 2022-11-28"

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

# ── Scope guard ─────────────────────────────────────────────────────

if [ "$TRACK_DEFAULT_BRANCH_ONLY" = "true" ] && [ "${CI_COMMIT_BRANCH:-}" != "$DEFAULT_BRANCH" ]; then
  echo "[issue-bot] Skipping non-default branch pipeline (${BRANCH}); tracking ${DEFAULT_BRANCH} only."
  exit 0
fi

# ── Helpers ─────────────────────────────────────────────────────────

list_open_issues() {
  curl -fsSL \
    -H "$AUTH_HEADER" \
    -H "$ACCEPT_HEADER" \
    -H "$API_VERSION_HEADER" \
    "${GITHUB_API_BASE}/issues?state=open&per_page=100"
}

fetch_job_log() {
  if [ -z "${CI_API_V4_URL:-}" ] || [ -z "${CI_PROJECT_ID:-}" ] || [ -z "${CI_JOB_ID:-}" ] || [ -z "${CI_JOB_TOKEN:-}" ]; then
    echo "(Could not fetch job log: missing CI API context)"
    return
  fi

  curl -fsSLk \
    -H "JOB-TOKEN: ${CI_JOB_TOKEN}" \
    "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/jobs/${CI_JOB_ID}/trace" 2>/dev/null \
    | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' \
    | tail -100 \
    || echo "(Could not fetch job log)"
}

# ── Failure path: create or comment ─────────────────────────────────

handle_failure() {
  local existing
  existing="$(list_open_issues)"

  local number html_url
  number="$(echo "$existing" | jq -r --arg title "$ISSUE_TITLE" '.[] | select(.pull_request | not) | select(.title == $title) | .number' | head -n1)"

  if [ -n "$number" ] && [ "$number" != "null" ]; then
    html_url="$(echo "$existing" | jq -r --argjson number "$number" '.[] | select((.number == $number)) | .html_url' | head -n1)"
    echo "[issue-bot] Open issue already exists: ${html_url}"

    local comment_payload
    comment_payload="$(jq -n \
      --arg pipeline "${CI_PIPELINE_URL:-unknown}" \
      --arg commit "${CI_COMMIT_SHORT_SHA:-unknown}" \
      --arg job_url "${CI_JOB_URL:-unknown}" \
      '{body: ("**Another failure detected**\n\n" +
        "- Pipeline: " + $pipeline + "\n" +
        "- Commit: `" + $commit + "`\n" +
        "- Job: " + $job_url)}')"

    curl -fsSL \
      -H "$AUTH_HEADER" \
      -H "$ACCEPT_HEADER" \
      -H "$API_VERSION_HEADER" \
      -H "Content-Type: application/json" \
      -X POST \
      -d "$comment_payload" \
      "${GITHUB_API_BASE}/issues/${number}/comments" > /dev/null

    echo "[issue-bot] Added comment to issue #${number}."
    return
  fi

  local job_log
  job_log="$(fetch_job_log)"

  local body
  body="$(jq -n \
    --arg job_name "${CI_JOB_NAME:-unknown}" \
    --arg job_url "${CI_JOB_URL:-unknown}" \
    --arg pipeline_url "${CI_PIPELINE_URL:-unknown}" \
    --arg pipeline_id "${CI_PIPELINE_ID:-unknown}" \
    --arg branch "$BRANCH" \
    --arg commit "${CI_COMMIT_SHORT_SHA:-unknown}" \
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
      "---\n_Created automatically by CI issue bot._"')"

  local create_payload response new_url
  create_payload="$(jq -n --arg title "$ISSUE_TITLE" --arg body "$body" '{title: $title, body: $body}')"

  response="$(curl -fsSL \
    -H "$AUTH_HEADER" \
    -H "$ACCEPT_HEADER" \
    -H "$API_VERSION_HEADER" \
    -H "Content-Type: application/json" \
    -X POST \
    -d "$create_payload" \
    "${GITHUB_API_BASE}/issues")"

  new_url="$(echo "$response" | jq -r '.html_url // "unknown"')"
  echo "[issue-bot] Created issue: ${new_url}"
}

# ── Success path: auto-close resolved issues ────────────────────────

handle_success() {
  local issues
  issues="$(list_open_issues)"

  local numbers
  if [ "$TRACK_DEFAULT_BRANCH_ONLY" = "true" ] && [ "${CI_COMMIT_BRANCH:-}" = "$DEFAULT_BRANCH" ]; then
    numbers="$(echo "$issues" | jq -r --arg prefix "$ISSUE_TITLE_PREFIX" '.[] | select(.pull_request | not) | select(.title | startswith($prefix)) | .number')"
  else
    numbers="$(echo "$issues" | jq -r --arg title "$ISSUE_TITLE" '.[] | select(.pull_request | not) | select(.title == $title) | .number')"
  fi

  if [ -z "$numbers" ]; then
    return
  fi

  local number
  while IFS= read -r number; do
    [ -z "$number" ] && continue

    local comment_payload
    comment_payload="$(jq -n \
      --arg job_url "${CI_JOB_URL:-unknown}" \
      --arg commit "${CI_COMMIT_SHORT_SHA:-unknown}" \
      '{body: ("**Resolved** :white_check_mark:\n\n" +
        "Job passed in commit `" + $commit + "`: " + $job_url)}')"

    curl -fsSL \
      -H "$AUTH_HEADER" \
      -H "$ACCEPT_HEADER" \
      -H "$API_VERSION_HEADER" \
      -H "Content-Type: application/json" \
      -X POST \
      -d "$comment_payload" \
      "${GITHUB_API_BASE}/issues/${number}/comments" > /dev/null

    curl -fsSL \
      -H "$AUTH_HEADER" \
      -H "$ACCEPT_HEADER" \
      -H "$API_VERSION_HEADER" \
      -H "Content-Type: application/json" \
      -X PATCH \
      -d '{"state":"closed"}' \
      "${GITHUB_API_BASE}/issues/${number}" > /dev/null

    echo "[issue-bot] Closed issue #${number} (job now passes)."
  done <<< "$numbers"
}

# ── Main ────────────────────────────────────────────────────────────

if [ "$JOB_STATUS" = "failed" ]; then
  handle_failure
elif [ "$JOB_STATUS" = "success" ]; then
  handle_success
fi
