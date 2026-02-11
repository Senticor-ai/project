# TerminAndoYo (TAY)

A **ontology-native task management system** bringing schema.org into a modern, evidence-first workspace raising productivity at work in any context and scale.

## Quick Start

```bash
# Frontend
cd frontend && npm install && npm run storybook   # Storybook at http://localhost:6006
cd frontend && npm run dev                         # Vite dev server

# Backend (API server)
cd backend && uv sync && uv run uvicorn app.main:app --reload

# Backend (worker — processes import jobs, search indexing, push notifications)
cd backend && uv run python -m app.worker --loop
```

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
| Backend       | Python, FastAPI, Haystack, PostgreSQL, Apache Jena Fuseki, Qdrant               |
| Observability | OpenTelemetry, Grafana LGTM (Loki, Grafana, Tempo, Mimir)                       |
| Auth          | Local JWT with HTTP-only cookies                                                |

## Development

See [CLAUDE.md](CLAUDE.md) for development practices, coding conventions, and pre-commit checks.

```bash
# Run tests
cd frontend && CI=1 npx vitest run --project=unit   # Frontend unit tests
cd backend && uv run python -m pytest               # Backend tests

# Pre-commit checks (frontend)
cd frontend && npx tsc -b --noEmit && npx eslint src/ && npx prettier --check src/
```

## API

- **OpenAPI UI**: http://localhost:8000/docs
