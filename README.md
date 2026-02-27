# Senticor Project

A **ontology-native task management system** bringing schema.org into a modern, evidence-first workspace raising productivity at work in any context and scale.

## Quick Start

Prerequisite: `ansible-playbook` available in your shell.

```bash
# 1) ensure Rancher Desktop is running with Kubernetes + containerd
kubectl config use-context rancher-desktop

# 2) one-shot bootstrap (k8s Postgres + OpenClaw dev image)
npm run dev:bootstrap

# 3) start backend + workers + agents + frontend + storybook on host
#    (includes automatic Postgres port-forward + migration bootstrap)
npm run dev
```

One command from the repo root starts all app processes via `concurrently`
and auto-manages the Postgres tunnel:

| Process   | URL                          |
| --------- | ---------------------------- |
| Postgres  | localhost:5432 (port-forward) |
| Backend   | http://localhost:8000/docs   |
| Worker    | (background, no UI)          |
| Agents    | http://localhost:8002/health |
| Frontend  | http://localhost:5173        |
| Storybook | http://localhost:6006        |

Ctrl+C stops everything.

For the full in-cluster local stack (`frontend`, `backend`, `worker`, `storybook`, `postgres` all in k8s), see [`infra/k8s/README.md`](infra/k8s/README.md).

<details>
<summary>Manual host startup (individual terminals)</summary>

```bash
kubectl -n project port-forward svc/postgres 5432:5432
cd frontend && npm install && npm run storybook   # Storybook at http://localhost:6006
cd frontend && npm run dev                         # Vite dev server
cd backend && uv sync && uv run --python 3.12 python -m uvicorn app.main:app --reload  # API server
cd backend && uv run python -m app.worker --loop               # Worker
cd agents && uv sync && uv run --python 3.12 python -m uvicorn app:app --reload --port 8002  # Senticor agents
```
</details>

## Documentation

**Storybook is the single source of truth** for product specs, design system, architecture docs,
and interactive component demos.

```bash
cd frontend && npm run storybook   # http://localhost:6006
```

| Section     | What you'll find                                                             |
| ----------- | ---------------------------------------------------------------------------- |
| Product     | Vision, methodology, epics, feature specs                                    |
| Design      | Paperclip design language, philosophy, tokens, component catalog             |
| Engineering | Architecture, data model, schema reference, FRBR/LexCEL ontology, deployment |
| Flows       | End-to-end user journeys                                                     |

## Tech Stack

| Layer         | Technologies                                                                    |
| ------------- | ------------------------------------------------------------------------------- |
| Frontend      | React 19, Vite, TypeScript, Tailwind v4, shadcn/ui, Framer Motion, Storybook 10 |
| Backend       | Python, FastAPI, PostgreSQL, Meilisearch, Qdrant                                 |
| Agents        | Python, Haystack, OpenRouter (separate service for Copilot AI assistant)             |
| Observability | OpenTelemetry, Grafana LGTM (Loki, Grafana, Tempo, Mimir)                       |
| Auth          | Local JWT with HTTP-only cookies                                                |

## Development

See [CLAUDE.md](CLAUDE.md) for development practices, coding conventions, and pre-commit checks.

```bash
# Run tests
cd frontend && CI=1 npx vitest run --project=unit   # Frontend unit tests
cd backend && uv run python -m pytest               # Backend tests
cd agents && uv run python -m pytest tests/          # Agents tests

# Pre-commit checks (frontend)
cd frontend && npx tsc -b --noEmit && npx eslint src/ && npx prettier --check src/

# Local completion gate (required before marking work as done)
npm run preflight:local

# Strict local gate with backend integration (required for backend behavior/API changes)
# Requires local Postgres reachable on localhost:5432
# (e.g. running `npm run dev`, or manual `kubectl -n project port-forward svc/postgres 5432:5432`)
npm run preflight:local:strict

# CI parity preflight (recommended before push)
npm run preflight:ci
```

## Definition of Done

- Do not mark work complete until the local completion gate passes.
- For backend behavior/API changes, the strict gate must pass.
- If a required gate cannot run locally, treat the task as incomplete and report the blocker.

## API

- **OpenAPI UI**: http://localhost:8000/docs

## License

Copyright (c) 2026 Wolfgang Ihloff  
Licensed under the European Union Public Licence v1.2 (EUPL-1.2)  
SPDX-License-Identifier: EUPL-1.2

See [LICENSE](LICENSE) for the full EUPL-1.2 text.
