# Contributing

Thanks for contributing to TerminAndoYo.

## Scope

- Use small, focused pull requests.
- Keep behavior changes covered by tests.
- Document API or workflow changes in `README.md` (and `backend/README.md` if backend-specific).

## Local Setup

### Backend

```bash
cd backend
uv venv --python 3.12
uv sync --extra dev
uv run python -m app.db_init
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Quality Checks Before PR

### Backend checks

```bash
cd backend
uv run ruff check .
uv run ruff format .
uv run mypy app tests
uv run pytest
```

### Frontend checks

```bash
cd frontend
npm run lint
npm run type-check
npm run test
```

## Database Changes

- Use Alembic migrations for schema changes.
- Keep migrations in sync with app behavior and tests.

Example:

```bash
cd backend
uv run alembic revision -m "describe change"
uv run alembic upgrade head
```

## Commit and PR Guidance

- Write clear commit messages in imperative mood.
- Reference related issues in the PR description.
- Include:
  - what changed
  - why it changed
  - test evidence (commands run + result)
  - migration notes (if any)

## Import/Sync Changes

If you change import or sync behavior:

- add or update fixtures under `backend/tests/fixtures/`
- update integration tests under `backend/tests/`
- verify OpenAPI docs still describe new/changed request fields
