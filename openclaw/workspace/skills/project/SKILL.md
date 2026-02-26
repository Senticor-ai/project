---
name: project
description: Senticor Project platform — CLI commands, org knowledge documents
user-invocable: false
---

# Senticor Project Platform

This skill covers CLI commands for item management and organization knowledge documents.

## CLI

The CLI is available at `/project/packages/core/cli/index.ts`.
Invoke: `npx tsx /project/packages/core/cli/index.ts [command] [options]`

For current help:
```bash
exec npx tsx /project/packages/core/cli/index.ts --help
```

### Global Options

| Option | Description |
|--------|-------------|
| `--host <url>` | Backend host (default: `$COPILOT_BACKEND_URL` or `http://localhost:8000`) |
| `--org-id <id>` | Tenant org ID (X-Org-Id header) |
| `--json` | Machine-readable JSON output |
| `--non-interactive` | No interactive prompts |
| `--yes` | Auto-confirm destructive actions |
| `--no-color` | Strip ANSI colors |

### Item Commands

**`items create`** — Create an action, reference, or event.

```bash
items create --type Action --name "Check taxes" --bucket next --apply
items create --type CreativeWork --name "Note" --description "..." --bucket reference --apply
items create --type Event --name "Meeting" --start-date 2026-03-01T10:00Z --end-date 2026-03-01T11:00Z --apply
items create --type Action --name "Task" --bucket next --project <project-id> --apply
```

Available `--type` values:
- **Action** (bucket: inbox, next, waiting, calendar, someday) — Fields: `--name`, `--bucket`, `--due-date`
- **Project** (status: active, completed, on-hold, archived) — Fields: `--name`, `--description`
- **CreativeWork** (bucket: reference) — Fields: `--name`, `--description`
- **DigitalDocument** (bucket: reference) — Fields: `--name`
- **Person** (bucket: reference) — Fields: `--name`
- **Event** (bucket: calendar) — Fields: `--name`, `--start-date`, `--end-date`

**`items triage`** — Move an item to a different bucket.

```bash
items triage <item-id> --bucket next --apply
items triage <item-id> --bucket someday --apply
```

**`items focus`** — Set or remove focus on an item.

```bash
items focus <item-id> --on --apply
items focus <item-id> --off --apply
```

### Project Commands

**`projects create`** — Create a new project.

```bash
projects create --name "Tax return 2025" --desired-outcome "Submit by 31.07." --apply
```

**`projects actions create`** — Create an action within a project.

```bash
projects actions create --project <project-id> --name "Collect receipts" --bucket next --apply
```

**`projects actions update`** — Update a project action.

```bash
projects actions update --project <project-id> --action <action-id> --name "New name" --apply
```

**`projects actions transition`** — Change action status.

```bash
projects actions transition --project <project-id> --action <action-id> --status completed --apply
```

**`projects actions comments add`** — Add a comment to a project action.

```bash
projects actions comments add --project <project-id> --action <action-id> --text "Comment" --apply
```

**`projects actions comments reply`** — Reply to a comment.

```bash
projects actions comments reply --project <project-id> --action <action-id> --comment <comment-id> --text "Reply" --apply
```

### Calendar Commands

**`calendar list`** — List calendar events.

```bash
calendar list --date-from 2026-03-01 --date-to 2026-03-07 --limit 50
```

**`calendar patch`** — Update a calendar event.

```bash
calendar patch <canonical-id> --name "New title" --start-date 2026-03-01T10:00Z
```

**`calendar rsvp`** — Set RSVP status.

```bash
calendar rsvp <canonical-id> --status accepted
calendar rsvp <canonical-id> --status declined
```

### Org Commands

**`orgs list`** — List organizations the user belongs to.

```bash
orgs list
```

**`orgs get`** — Get org details with linked reference documents.

```bash
orgs get <idOrName> --docs
```

### Proposals

**`proposals apply`** — Apply proposals (e.g. email proposals).

```bash
proposals apply --apply
```

### CLI Rules

- Always use `--apply` for write commands.
- For `projects actions *`, always set `--project <id>` and (where needed) `--action <id>` explicitly.
- No positional arguments for action IDs.
- Use `--help` for current command reference.

---

## Organization Knowledge Documents

Each organization has 4 knowledge documents that you can read and — depending on type — edit.

### Org Context

Your token (`/runtime/token`) is automatically scoped to the user's organization.
No manual `X-Org-Id` needed — all API calls with the Bearer token are automatically
scoped to the correct org.

### List Orgs

```bash
exec curl -s "$COPILOT_BACKEND_URL/orgs" \
  -H "Authorization: Bearer $(cat /runtime/token)"
```

Response: Array with `id`, `name`, `role`, `generalDocId`, `userDocId`, `logDocId`, `agentDocId`.

The `*DocId` fields are item IDs for the 4 knowledge documents.

### Document Types

| Type | Content | Write Access |
|------|---------|--------------|
| **general** | Org info (policies, processes, contacts) | Only with user confirmation |
| **user** | User's personal notes about the org | Only with user confirmation |
| **log** | Chronological protocol (events, decisions) | Yes, append-only |
| **agent** | Your own working notes (summaries, learned context) | Yes |

### Read a Document

```bash
exec curl -s "$COPILOT_BACKEND_URL/items/<doc_id>/content" \
  -H "Authorization: Bearer $(cat /runtime/token)"
```

Response includes `file_content` with the markdown text.

### Edit a Document (general, user, agent)

Replaces the entire content:

```bash
exec curl -s -X PATCH "$COPILOT_BACKEND_URL/items/<doc_id>/file-content" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -H "X-Agent: openclaw" \
  -d '{"text": "New content in markdown"}'
```

### Append to Log

Adds a timestamped entry:

```bash
exec curl -s -X POST "$COPILOT_BACKEND_URL/items/<doc_id>/append-content" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -H "X-Agent: openclaw" \
  -d '{"text": "New log entry"}'
```

The timestamp is prepended automatically.

### Write Permissions

| Document | Read | Write | Method |
|----------|------|-------|--------|
| general | Yes | Only if user explicitly asks | PATCH file-content |
| user | Yes | Only if user explicitly asks | PATCH file-content |
| log | Yes | Yes (append-only — never overwrite) | POST append-content |
| agent | Yes | Yes (your own notes) | PATCH file-content |

**Important:**
- Never overwrite `general` or `user` without explicit user request.
- The `log` document is append-only — always use `append-content`, never `file-content`.
- The `agent` document is your scratchpad. Store learned context there
  (e.g. abbreviations, common processes, user preferences).

### When to Use

- When the user asks about the organization, team, or policies
- When you need org context for better answers
- When the user wants to document a decision or event — append to `log`
- When you learn something important about the org — persist to `agent` notes

### Example Workflow

```bash
# 1. List orgs and get doc IDs
exec curl -s "$COPILOT_BACKEND_URL/orgs" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# 2. Read general org info (generalDocId from step 1)
exec curl -s "$COPILOT_BACKEND_URL/items/<generalDocId>/content" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# 3. Read your agent notes (agentDocId from step 1)
exec curl -s "$COPILOT_BACKEND_URL/items/<agentDocId>/content" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# 4. Respond to user with collected context

# 5. Persist learned context to agent notes
exec curl -s -X PATCH "$COPILOT_BACKEND_URL/items/<agentDocId>/file-content" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -H "X-Agent: openclaw" \
  -d '{"text": "# Org Context\n\n- Tax advisor: Firma XY\n- Tax number: ..."}'
```
