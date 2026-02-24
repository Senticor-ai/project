# Copilot Intent Contract (Draft v0)

This draft introduces an optional high-level `intent` payload for `copilot_cli`.
It is backward-compatible with raw `argv[]`.

## Tool Arguments

`copilot_cli` now accepts exactly one of:

- `argv: string[]` (existing behavior)
- `intent: object` (draft v0)

## Intent Envelope

```json
{
  "schemaVersion": "copilot.intent.v0",
  "kind": "weekly_review_plan | job_search_create_reference | tax_missing_documents_plan",
  "...": "kind-specific fields"
}
```

## Kind: `weekly_review_plan`

Purpose: collapse multi-step weekly review changes into one proposal.

Supported fields:

- `focusOn: string[]`
- `focusOff: string[]`
- `triage: [{ itemId: string, bucket: string }]`
- `schedule: [{ name: string, description?: string, date?: string, time?: string }]`
- `notes: [{ title: string, markdown: string }]`

CLI mapping:

- `focusOn[i]` -> `items focus <id> --on --apply`
- `focusOff[i]` -> `items focus <id> --off --apply`
- `triage[i]` -> `items triage <id> --bucket <bucket> --apply`
- `schedule[i]` -> `items create --type Action --name <name> --bucket calendar [--description <merged>] --apply`
- `notes[i]` -> `items create --type CreativeWork --name <title> --bucket reference --description <markdown> --apply`

## Kind: `job_search_create_reference`

Purpose: simplify the "tailored CV markdown" write step.

Required fields:

- `projectId: string`
- `name: string`
- `markdown: string`

CLI mapping:

- `items create --type CreativeWork --name <name> --description <markdown> --project <projectId> --bucket reference --apply`

## Kind: `tax_missing_documents_plan`

Purpose: create missing-doc follow-up actions in one proposal.

Fields:

- `projectId?: string`
- `entries: [{ name: string, bucket: "next" | "waiting", description?: string }]`

CLI mapping:

- `entries[i]` -> `items create --type Action --name <name> --bucket <bucket> [--description <description>] [--project <projectId>] --apply`

## Executor Rules

- Compiles `intent` into one or more CLI argv arrays.
- Enforces deterministic flags on each command:
  - `--json`
  - `--non-interactive`
  - `--yes`
- Auto-injects `--conversation-id <id>` for `items create` and `projects create` when missing.
- Executes compiled commands sequentially and merges created items by canonical id.

