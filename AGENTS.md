# AGENTS.md

## Completion Gate (Codex / Claude Code)

Before sending a final "done" response for any code change in this repository:

1. Run `npm run preflight:local`.
2. If backend behavior changed (for example `backend/app/**`, migrations, API contracts), also run:
   `npm run preflight:local:strict`
3. Do not claim completion if any command fails.
4. In the final response, list the commands that were run and whether they passed.

If strict backend integration checks cannot be run (for example Postgres unavailable), state that
explicitly and mark the task as incomplete until resolved or explicitly waived by the user.

## Observability

When investigating `project` incidents or issues involving logs, metrics, traces, or Grafana dashboards, use the `grafana-project-readonly` MCP server if it is configured.

Start with Loki queries scoped to `namespace="project"` and correlate on `request_id` or `conversation_id`, then use Prometheus and Tempo/Grafana as needed.
