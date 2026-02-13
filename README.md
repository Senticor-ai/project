# TerminAndoYo (TAY)

A **ontology-native task management system** bringing schema.org into a modern, evidence-first workspace raising productivity at work in any context and scale.

## Quick Start

```bash
npm run dev   # starts backend + worker + agents + frontend + storybook
```

One command from the repo root starts all five processes via `concurrently`:

| Process   | URL                          |
| --------- | ---------------------------- |
| Backend   | http://localhost:8000/docs   |
| Worker    | (background, no UI)          |
| Agents    | http://localhost:8002/health |
| Frontend  | http://localhost:5173        |
| Storybook | http://localhost:6006        |

Ctrl+C stops everything.

<details>
<summary>Manual startup (individual terminals)</summary>

```bash
cd frontend && npm install && npm run storybook   # Storybook at http://localhost:6006
cd frontend && npm run dev                         # Vite dev server
cd backend && uv sync && uv run uvicorn app.main:app --reload  # API server
cd backend && uv run python -m app.worker --loop               # Worker
cd agents && uv sync && uv run uvicorn app:app --reload --port 8002  # Tay agents
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
| Agents        | Python, Haystack, OpenRouter (separate service for Tay AI copilot)               |
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
```

## API

- **OpenAPI UI**: http://localhost:8000/docs
