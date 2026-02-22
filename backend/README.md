# Backend (FastAPI)

This backend provides a Postgres-backed catalog for schema.org-aligned JSON-LD with optional Meilisearch full-text search.

## Requirements

- Python 3.12
- uv (Python package manager)
- Postgres (via Rancher Desktop)
- Meilisearch (optional, for full-text search)

## Environment

Create a `.env` in the repo root (or in `backend/`) with:

```
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<db>
POSTGRES_USER=<your-postgres-user>
POSTGRES_PASSWORD=<your-postgres-password>
POSTGRES_DB=<your-postgres-db>
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Search (Meilisearch)
MEILI_URL=http://localhost:7700
MEILI_API_KEY=
MEILI_INDEX_THINGS=things
MEILI_INDEX_FILES=files
MEILI_INDEX_FILES_ENABLED=false
MEILI_TIMEOUT_SECONDS=5
MEILI_BATCH_SIZE=500
MEILI_DOCUMENT_MAX_CHARS=100000
MEILI_FILE_TEXT_MAX_BYTES=5000000
MEILI_FILE_TEXT_MAX_CHARS=100000

SESSION_COOKIE_NAME=project_session
SESSION_TTL_DAYS=30
SESSION_TTL_MINUTES=
SESSION_TTL_SECONDS=
SESSION_REFRESH_TTL_DAYS=30
SESSION_REFRESH_COOKIE_NAME=project_refresh
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_SAMESITE=lax
SESSION_COOKIE_DOMAIN=
SESSION_COOKIE_PATH=/
SESSION_COOKIE_HTTP_ONLY=true
SESSION_BIND_IP=true
SESSION_BIND_USER_AGENT=true
SESSION_ROLL_IP_ON_REFRESH=true
SESSION_ROLL_UA_ON_REFRESH=true
TRUST_PROXY_HEADERS=false
CORS_ORIGINS=http://localhost:5173,http://localhost:6006

FILE_STORAGE_PATH=storage
UPLOAD_CHUNK_SIZE=5242880
IMPORT_JOB_QUEUE_TIMEOUT_SECONDS=300
OUTBOX_WORKER_POLL_SECONDS=1.0
PUSH_WORKER_POLL_SECONDS=1.0

VAPID_PUBLIC_KEY=<your-vapid-public-key>
VAPID_PRIVATE_KEY=<your-vapid-private-key>
VAPID_SUBJECT=mailto:admin@example.com

# Observability
LOG_FORMAT=json

# CSRF (BFF)
CSRF_ENABLED=false
CSRF_COOKIE_NAME=project_csrf
CSRF_HEADER_NAME=X-CSRF-Token
CSRF_COOKIE_SECURE=false
CSRF_COOKIE_SAMESITE=lax
CSRF_COOKIE_DOMAIN=
CSRF_COOKIE_PATH=/
```

Generate VAPID keys (one-time):

```
cd backend
uv run python - <<'PY'
from pywebpush import generate_vapid_private_key, generate_vapid_public_key

private_key = generate_vapid_private_key()
public_key = generate_vapid_public_key(private_key)
print("VAPID_PRIVATE_KEY=", private_key)
print("VAPID_PUBLIC_KEY=", public_key)
PY
```

Start the local services with Rancher Desktop:

```
docker compose -f infra/docker-compose.yml up -d
```

## Install

```
cd backend
uv venv --python 3.12
source .venv/bin/activate
uv sync
```

## Initialize Database

```
cd backend
uv run python -m app.db_init
```

`app.db_init` runs `alembic upgrade head` with retry-on-startup behavior.

## Migrations (Alembic)

Alembic is wired for manual migrations (no SQLAlchemy models).

```
cd backend
uv sync --extra dev
uv run alembic revision -m "describe change"
uv run alembic upgrade head
```

Migration policy (enforced in CI):

- All schema changes must ship as Alembic revisions under `backend/alembic/versions/`.
- Do not change `backend/db/schema.sql` by itself for feature work.
- If `backend/db/schema.sql` changes, the same change must include a matching Alembic revision.

## Run API

> **Tip:** `npm run dev` from the repo root starts the backend, worker, frontend, and Storybook together. The commands below are for running services individually.

```
cd backend
uv run --python 3.12 python -m uvicorn app.main:app --reload --port 8000
```

## Run Projection Worker

```
cd backend
uv run python -m app.worker --loop --interval 1 --batch-size 25
```

## Reindex Search

After enabling Meilisearch, backfill existing data:

```
cd backend
uv run python -m app.search.reindex
```

Include file metadata (and PDF text extraction if enabled):

```
cd backend
uv run python -m app.search.reindex --files
```

PDF text extraction uses pypdf for text-based PDFs. Docling is used for OCR and non-PDF formats
when file indexing is enabled. Ensure any required OCR backends are installed for your platform.
OCR settings are per-org and configurable via `GET/PUT /search/ocr-config`; reindex files after
changing OCR settings. Indexing status is tracked per file and item and exposed via
`/files/{file_id}/index-status` and `/items/{item_id}/index-status`. When VAPID keys are
configured, the worker emits push events on
success or failure.

## Run Push Worker

```
cd backend
uv run python -m app.push_worker --loop --interval 1 --batch-size 10
```

## Code Hygiene

Install dev tooling:

```
cd backend
uv sync --extra dev
```

Lint:

```
cd backend
uv run ruff check .
```

Format:

```
cd backend
uv run ruff format .
```

Type check:

```
cd backend
uv run mypy app tests
```

Security scan:

```
cd backend
uv run bandit -c pyproject.toml -r app
```

## File Storage

Files are stored on the local filesystem (`FILE_STORAGE_PATH`) in development. The API uses a chunked upload
flow (`/files/initiate`, `/files/upload/{upload_id}`, `/files/complete`) that can later be swapped to signed
uploads for a blob store without changing the client contract.

## Idempotency + Sync

- Use `Idempotency-Key` on `POST /items` and `POST /assertions` to safely retry offline writes.
- Use `Idempotency-Key` on `POST /files/initiate` and `POST /files/complete` to safely retry uploads.
- Use `GET /items/sync` with `since` **or** `cursor` for incremental sync.
- Use `ETag` / `If-None-Match` for cache-efficient polling.
- Use `X-Org-Id` to target a specific org when a user belongs to multiple orgs. If omitted,
  the user's default org is used when available.

## Observability

- Structured logs via `structlog` (set `LOG_FORMAT=console` for dev-friendly output).
- `X-Request-ID` is accepted from clients or generated and returned on every response.
- `X-User-ID` is optional and used for log context only (auth is always session-cookie based).
- Request context (request id, method, path, user id) is bound to logs and propagated to internal HTTP calls.
- Use `REQUEST_ID` and `USER_ID` env vars when spawning subprocesses to keep trace continuity.
- `GET /metrics` exposes Prometheus metrics for HTTP traffic and queue health (`outbox_events`,
  `push_outbox`, `import_jobs`, `search_index_jobs`).
- OTEL env vars for cluster deployments: `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
  `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_RESOURCE_ATTRIBUTES`.

## BFF Auth (Session Cookies)

- Session cookies are configurable via `SESSION_COOKIE_*`.
- When `CSRF_ENABLED=true`, state-changing requests must include `X-CSRF-Token` matching the CSRF cookie.
- Use `GET /auth/csrf` to fetch a token for SPA/PWA clients and include it on `POST/PUT/PATCH/DELETE`.
- `POST /auth/refresh` rotates short-lived sessions using a refresh cookie.

## Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /orgs`
- `POST /orgs`
- `POST /orgs/{org_id}/members`
- `GET /items` (supports `since`, ETags)
- `GET /items/sync` (cursor-based sync, ETags)
- `GET /items/{item_id}` (ETags)
- `GET /items/{item_id}/index-status`
- `POST /items` (idempotency + conflict detection)
- `POST /assertions`
- `POST /files/initiate`
- `PUT /files/upload/{upload_id}`
- `POST /files/complete`
- `GET /files/{file_id}` (ETags)
- `GET /files/{file_id}/meta` (ETags)
- `GET /files/{file_id}/index-status`
- `POST /imports/nirvana` (sync bulk import, supports `dry_run=true`)
- `POST /imports/nirvana/inspect` (validate uploaded file)
- `POST /imports/nirvana/from-file` (queue async import job)
- `GET /imports/jobs` (list current user's jobs; filter with `?status=queued&status=running`)
- `GET /imports/jobs/{job_id}` (single job status for current user)
- `GET /search` (Meilisearch-backed)
- `GET /push/vapid-public-key`
- `POST /push/subscribe`
- `POST /push/unsubscribe`
- `POST /push/notify`
- `POST /push/test`
- `GET /health`
- `GET /` (API links)
- `GET /docs` (Swagger UI)
- `GET /redoc` (ReDoc)
- `GET /openapi.json` (OpenAPI 3.1)
- `GET /.well-known/openapi` (discovery)

All non-auth endpoints require the session cookie set by `POST /auth/login`.

`POST /auth/register` expects `email`, `username`, and `password`. Usernames must be unique; email
domains must be valid (for example, `user@example.com`); and passwords must be at least 8 characters
with at least one letter and one digit or symbol.
