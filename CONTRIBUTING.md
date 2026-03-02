# Contributing

Thanks for contributing to project.

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

## Releases

- Versioning follows Semantic Versioning (SemVer).
- Release tags use `v{MAJOR}.{MINOR}.{PATCH}` (for example, `v0.1.0`).
- Create release tags from `main` after required checks pass.

### Release Notes

Use [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format in `CHANGELOG.md`:

- Maintain an `## [Unreleased]` section with `### Added`, `### Changed`, `### Fixed`, and `### Security`.
- Move entries from `Unreleased` into a versioned section when creating a release tag.

### Vulnerability Tracking

For every release, include a `### Security` subsection in the release notes:

- List fixed vulnerabilities with CVE IDs when available (for example, `CVE-2026-12345`).
- If no vulnerabilities were fixed, state `No known security fixes in this release.`
