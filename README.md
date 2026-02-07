# TerminAndoYo

Monorepo with:
- `backend/`: FastAPI + Postgres
- `frontend/`: React + Vite
- `infra/`: local Docker services

## Start Backend (Local Dev)

### 1) Prerequisites

- Python `3.12`
- `uv`
- Docker (or a local Postgres instance)
- Node.js `>=20.16` and `npm` (for the frontend)

### 2) Configure environment

From repo root:

```bash
cp .env.example .env
```

Set at least these values in `.env`:

```env
POSTGRES_USER=terminandoyo
POSTGRES_PASSWORD=<your-password>
POSTGRES_DB=terminandoyo
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
DATABASE_URL=postgresql://terminandoyo:<your-password>@localhost:5432/terminandoyo
CORS_ORIGINS=http://localhost:5173,http://localhost:6006
FILE_STORAGE_PATH=storage
IMPORT_JOB_QUEUE_TIMEOUT_SECONDS=300
OUTBOX_WORKER_POLL_SECONDS=1.0
PUSH_WORKER_POLL_SECONDS=1.0
```

### 3) Start dependencies

From repo root:

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

Optional services:

```bash
docker compose -f infra/docker-compose.yml up -d fuseki meilisearch
```

### 4) Install backend deps

```bash
cd backend
uv venv --python 3.12
uv sync --extra dev
```

### 5) Initialize database schema

Current bootstrap path:

```bash
cd backend
uv run python -m app.db_init
```

Migration path (recommended for schema changes):

```bash
cd backend
uv run alembic revision -m "describe change"
uv run alembic upgrade head
```

### 6) Run backend (API + workers)

One command starts the API server and both workers:

```bash
cd backend
uv run python -m app.dev
```

This spawns three processes (uvicorn with `--reload`, outbox worker, push worker) and forwards `Ctrl-C` to stop them all.

To run services individually instead (e.g. for debugging a single worker), see [Useful Commands](#useful-commands).

### 6b) Run frontend

In a separate terminal:

```bash
cd frontend
npm run dev
```

### 7) Verify backend is healthy

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/health/schema
```

If `/health/schema` reports missing tables (for example `search_index_jobs`), run:

```bash
cd backend
uv run python -m app.db_init
```

### 8) Open API docs

- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

## Useful Commands

Start backend (API + workers):

```bash
cd backend
uv run python -m app.dev
```

Run individual backend services:

```bash
# API only
cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Outbox worker only (imports, search indexing)
cd backend && uv run python -m app.worker --loop --interval 1 --batch-size 25

# Push worker only (Web Push delivery)
cd backend && uv run python -m app.push_worker --loop --interval 1 --batch-size 10
```

Run backend tests:

```bash
cd backend
uv run pytest
```

Run frontend tests:

```bash
cd frontend
CI=1 npx vitest run
```

## Frontend

Frontend setup and commands live in `frontend/` (Vite project).

## License

This repository is licensed under `EUPL-1.2`. See `LICENSE`.

## Community

- Contribution guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`

## GitLab Prep Checklist

Before first push:

1. Initialize git (if not already initialized):
   ```bash
   git init
   git branch -M main
   ```
2. Verify secrets are ignored:
   ```bash
   git check-ignore -v .env .env.example
   ```
3. Validate the project locally:
   ```bash
   cd backend && uv run pytest
   cd ../frontend && npm run test
   ```
4. Add GitLab remote and push:
   ```bash
   git remote add origin <gitlab-repo-url>
   git add .
   git commit -m "Initial import under EUPL-1.2"
   git push -u origin main
   ```
