# Gmail Sync + Proposal CEL Rules

Source of truth for sync/proposal behavior rules:

- `sync_behavior_rules.json`

The backend evaluates these rules via `app.email.cel_rules.evaluate_rule()` in:

- `app/email/sync.py`
- `app/email/proposals.py`

## Context Contract

Rules are evaluated against a context object with `operation` plus typed sub-objects.
Current top-level keys used by rules:

- `operation` (string)
- `gmail` (object)
- `message` (object)
- `email` (object)
- `calendar` (object)
- `proposal` (object)

Example:

```json
{
  "operation": "proposal.detect",
  "email": { "has_reschedule_keyword": true },
  "calendar": { "has_candidate_event": true }
}
```
