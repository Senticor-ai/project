# @project/core (CLI slice)

This package contains the first working `tay` CLI slice for Senticor Project.

## Run locally

From repo root:

```bash
npm run tay -- --help
npm run tay -- auth status --json
```

## Current commands

- `auth register|login|status|logout`
- `items list|get|create|triage`
- `projects list|get`
- `orgs list|get`
- `proposals list|apply`

## Proposal/apply flow

Write commands default to proposal mode:

```bash
npm run tay -- items create --type Action --name "File taxes" --bucket next --propose --json
npm run tay -- proposals apply <proposal-id> --yes --json
```

Direct apply is also available:

```bash
npm run tay -- items create --type Action --name "File taxes" --bucket next --apply --yes --json
```
