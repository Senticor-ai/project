# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Development Practices

- **Walking skeleton first** - Get the thinnest end-to-end slice working before layering features. Prove the architecture early.
- **TDD (red-green-refactor)** - Write failing tests first, implement the minimum to pass, then clean up. No untested production code.
- **Green suite first** - Before starting any implementation, run the full check suite (`tsc --noEmit`, `vitest run`, `eslint`, `pytest`) and confirm it's green. If there are pre-existing failures, fix them first before writing new code — don't just flag them and move on.
- **No broken windows** - Fix warnings, type errors, and lint issues as you encounter them, even if they predate your changes. Don't leave them for later and don't skip them because "they were already there".
- **No hardcoded secrets** - Never put passwords, API keys, or secrets directly in `docker-compose.yml`, code, or config files. Use environment variables with `${VAR:-default}` syntax for local dev defaults.
- **Robust over quick fixes** - Prefer proper solutions over lint-disable comments or workarounds. For example, use `useEffect` + `ref` for focus management instead of `autoFocus` with eslint-disable.

## Secrets in Documentation

When documenting example credentials, use placeholder patterns that scanners recognize as non-secrets:

```bash
# Placeholder patterns (no marker needed, forces user to set value)
DB_PASSWORD=<your-db-password>
API_KEY=${API_KEY}
TOKEN={{TOKEN}}
SECRET=<SECRET>
```

Common placeholder patterns (auto-ignored by scanners):
- `<your-password>`, `<DB_PASSWORD>` - angle brackets
- `${VAR}`, `$VAR` - shell variable syntax
- `{{VAR}}` - template syntax
- `your_api_key_here`, `changeme`, `placeholder` - obvious placeholders

Fallback markers (only when placeholder patterns aren't possible):
- `# gitleaks:allow` - gitleaks
- `# pragma: allowlist secret` - detect-secrets
- `# nosec B105` - bandit (Python hardcoded password check)

## Language Policy

| Context | Language |
|---------|----------|
| Code (variables, functions, classes, comments) | English |
| Documentation (README, docs/, CLAUDE.md) | English |
| Git commits and PR descriptions | English |
| UI strings | German (de) and English (en) via i18n |
| LLM prompt templates | German (primary) |
| Case examples, test fixtures, domain terms | German |
| User persona | German federal clerks (Bundesbeamte) |

## Data Retention (No-Delete Policy)

**Users cannot delete anything.** This is a core design principle for legal/audit compliance:

- Use **archiving** (soft delete) instead of deletion
- Archive sets `archived_at` timestamp, hides from lists, preserves all data
- Full provenance must be maintained for court proceedings and audits
- See `docs/data-retention.md` for complete policy

## Architecture

- **Backend**: FastAPI + Haystack + Qdrant + PostgreSQL
- **Frontend**: React 19 + Vite + Tailwind v4 + shadcn/ui + Framer Motion
- **LLM**: OpenRouter (model configurable via env)
- **Observability**: OpenTelemetry -> Grafana (docker-otel-lgtm)
- **Auth**: Local JWT with HTTP-only cookies

## Storybook (Single Source of Truth)

Storybook is the **living documentation hub** — product specs, design system, engineering architecture, and interactive component demos all live here as MDX pages alongside component stories.

```bash
cd frontend && npm run storybook       # Dev server at http://localhost:6006
cd frontend && npm run build-storybook  # Static build
```

### Documentation structure (`frontend/src/docs/`)

| Directory | Content |
|-----------|---------|
| `product/` | Vision, GTD methodology, epics, feature specs |
| `design/` | Design philosophy, Paperclip principles, design tokens, component catalog |
| `engineering/` | Architecture, data model, schema reference, FRBR/LexCEL ontology, deployment, routing |
| `flows/` | End-to-end user journeys (Collect-to-Engage) |

### Component stories (`frontend/src/**/*.stories.tsx`)

Every UI component has a `.stories.tsx` file with interactive variants. Stories are the visual test harness — check Storybook before and after UI changes.

### When working on this project

- **Read the relevant MDX docs first** when working on a feature area — they contain design decisions, data model constraints, and architectural rationale
- **Update MDX docs** when changing architecture, adding features, or modifying the data model
- **Cross-link** between docs using Storybook's `?path=/docs/...` syntax

## Pre-commit Checks (MANDATORY)

**Before claiming any code change is complete, run ALL relevant checks:**

```bash
# Backend checks (run from backend/)
cd backend
uv run ruff check .                    # Linting (security, style, bugs)
uv run ruff format --check .           # Format check (no modifications)
uv run mypy app/                       # Type checking

# Frontend checks (run from frontend/)
cd frontend
npx eslint src/                        # Linting
npx prettier --check src/              # Format check
npx tsc --noEmit                       # Type checking
```

**Rules:**
- Fix ALL errors before marking a task as done
- Don't ignore linter warnings - they often catch real bugs
- If you modify Python files, run ruff + mypy on affected files
- If you modify TypeScript files, run eslint + prettier + tsc on affected files
- When adding i18n keys, add to BOTH `messages.en.ts` and `messages.de.ts`

**Quick validation for changed files only:**
```bash
# Backend: check specific files
uv run ruff check app/path/to/file.py
uv run mypy app/path/to/file.py

# Frontend: check specific files
npx eslint src/path/to/file.tsx
npx tsc --noEmit
```

## Test Commands

```bash
# Frontend unit tests (vitest, never use watch mode)
cd frontend && CI=1 npx vitest run --project=unit

# Frontend storybook tests (vitest browser mode + Playwright)
cd frontend && STORYBOOK_TESTS=1 CI=1 npx vitest run --project=storybook

# Frontend type check
cd frontend && npx tsc --noEmit

# Frontend coverage (per-project reports)
cd frontend && npm run test:coverage:unit        # → coverage/unit/
cd frontend && npm run test:coverage:storybook   # → coverage/storybook/

# Frontend integration tests (mocked services, Playwright)
cd frontend && npm run test:integration

# Frontend E2E tests (requires running services: Keycloak, backend, database)
cd frontend && npm run test:e2e

# Backend tests
cd backend && uv run python -m pytest
```

Always use `CI=1 npx vitest run` (not `npx vitest` which starts watch mode).

## MSW (Mock Service Worker)

Storybook stories use MSW to intercept API requests in-browser, enabling "connected" stories that exercise real hooks and serialization.

- **Handlers**: `frontend/src/test/msw/handlers.ts` — in-memory store with handlers for Things, Files, Imports, Auth APIs
- **Fixtures**: `frontend/src/test/msw/fixtures.ts` — `store`, `seedMixedBuckets()`, `createThingRecord()`, `buildSyncResponse()`
- **Worker setup**: `frontend/.storybook/msw-setup.ts` — `setupWorker(...handlers)` from `msw/browser`
- **Vitest lifecycle**: `frontend/.storybook/vitest.setup.ts` — `beforeAll(worker.start)`, `afterEach(worker.resetHandlers)`, `afterAll(worker.stop)`
- **Preview**: `frontend/.storybook/preview.tsx` — conditional start (skips in vitest mode), per-story handler overrides via `parameters.msw.handlers`

**Handler URL patterns**: Use wildcard prefix `*/path` (e.g. `*/things/sync`) because `VITE_API_BASE_URL=http://localhost:8000` makes fetch URLs absolute. MSW needs wildcards to match any origin.

**Per-story overrides**: Use `parameters.msw.handlers` array — the preview loader applies them via `worker.use()`. Cleaned up by `afterEach(worker.resetHandlers)` in tests.

## i18n

- Frontend: ICU MessageFormat via `intl-messageformat`. Messages in `frontend/src/i18n/messages.{en,de}.ts`.
- Backend prompts: Jinja2 templates in `backend/app/prompts/de/`. Use `load_prompt(path, **vars)`.
- Backend errors: `AppError(code, message, status)` -> structured JSON `{"code", "message"}`.
- Full reference: `docs/i18n.md`

## API Documentation

- **OpenAPI UI**: `http://localhost:8000/docs`


## GitLab

- **CLI**: Use `glab` (not `gh`) for all GitLab operations — issues, MRs, labels, milestones.
- **Issue tracking**: Create GitLab issues for open/unvalidated work, features pending human testing, or tasks that need follow-up. This keeps work visible even when not yet code-complete.
- Don't push unless explicitly asked.
- Don't amend commits unless explicitly asked.
- Don't force-push.

