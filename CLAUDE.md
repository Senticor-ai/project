# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Practices

- **Walking skeleton first** - Get the thinnest end-to-end slice working before layering features. Prove the architecture early.
- **TDD (red-green-refactor)** - Write failing tests first, implement the minimum to pass, then clean up. No untested production code.
- **Green suite first** - Before starting any implementation, run the full check suite (`tsc -b --noEmit`, `vitest run`, `eslint`, `pytest`) and confirm it's green. If there are pre-existing failures, fix them first before writing new code — don't just flag them and move on.
- **No broken windows** - Fix warnings, type errors, and lint issues as you encounter them, even if they predate your changes. Don't leave them for later and don't skip them because "they were already there".
- **No hardcoded secrets** - Never put passwords, API keys, or secrets directly in `docker-compose.yml`, code, or config files. Use environment variables with `${VAR:-default}` syntax for local dev defaults.
- **Robust over quick fixes** - Prefer proper solutions over lint-disable comments or workarounds. For example, use `useEffect` + `ref` for focus management instead of `autoFocus` with eslint-disable.

## Completion Gate (MANDATORY)

Before declaring any change "done":

1. Run `npm run preflight:local`
2. If backend behavior/API contracts changed, also run `npm run preflight:local:strict`
3. If any required check fails, do not mark the task complete
4. Include executed check commands and pass/fail status in the final update

## Secrets in Documentation

See Storybook: [Engineering / Secrets Documentation](?path=/docs/engineering-secrets-documentation--docs)

## Language Policy

| Context                                        | Language                              |
| ---------------------------------------------- | ------------------------------------- |
| Code (variables, functions, classes, comments) | English                               |
| Documentation (README, docs/, CLAUDE.md)       | English                               |
| Git commits and PR descriptions                | English                               |
| UI strings                                     | German (de) and English (en) via i18n |
| LLM prompt templates                           | German (primary)                      |
| Case examples, test fixtures, domain terms     | German                                |
| User persona                                   | German federal clerks (Bundesbeamte)  |

## Data Retention (No-Delete Policy)

**Users cannot delete anything.** This is a core design principle for legal/audit compliance:

- Use **archiving** (soft delete) instead of deletion
- Archive sets `archived_at` timestamp, hides from lists, preserves all data
- Full provenance must be maintained for court proceedings and audits
- See Storybook: [Engineering / Data Retention](?path=/docs/engineering-data-retention--docs)

## Architecture

- **Backend**: FastAPI + PostgreSQL (REST API, auth, proxy to agents)
- **Agents**: Haystack + OpenRouter (separate FastAPI service on port 8002, Copilot copilot)
- **Frontend**: React 19 + Vite + Tailwind v4 + shadcn/ui + Framer Motion
- **LLM**: OpenRouter (model configurable via env)
- **Observability**: OpenTelemetry -> Grafana (docker-otel-lgtm)
- **Auth**: Local JWT with HTTP-only cookies

## Tech Stack (pinned versions)

| Layer | Use | Version | NOT this |
|-------|-----|---------|----------|
| Runtime | Node.js | 24 LTS | Not 26 (not LTS yet) |
| Runtime | Python | 3.12 | Not 3.13 |
| Frontend | React | 19.x | Not Next.js, Remix |
| Build | Vite | 7.x | Not Webpack, Turbopack |
| Styling | Tailwind CSS | 4.x | Not styled-components, Emotion |
| Components | shadcn/ui patterns | (custom) | Not MUI, Ant Design |
| State | TanStack Query | 5.x | Not Redux, Zustand, SWR |
| Animation | Framer Motion | 12.x | Not react-spring |
| Testing | Vitest + Testing Library | 4.x / 16.x | Not Jest |
| E2E | Playwright | 1.58.x | Not Cypress, Selenium |
| Stories | Storybook | 10.x | Not Docz |
| Mocking | MSW | 2.x | Not nock, axios-mock |
| Validation | AJV (JSON Schema) | 8.x | Not Zod, Yup, io-ts |
| i18n | Custom getMessage() | — | Not react-intl, i18next |
| AI Agents | Haystack | 2.x | Not LangChain, CrewAI |
| LLM access | OpenRouter | — | Not direct OpenAI SDK |
| DB | PostgreSQL | 16 | Not MySQL, MongoDB |
| TypeScript | — | ~5.9.x | Not bleeding edge |
| ESLint | — | 9.x | Not 10 yet |
| Formatting | Prettier | 3.x | Not Biome |

## Curated Knowledge Sources

| Topic | Reference |
|-------|-----------|
| React 19 API | https://react.dev/reference/react |
| TanStack Query v5 | https://tanstack.com/query/v5/docs/ |
| Playwright | https://playwright.dev/docs/api/class-page |
| Vitest | https://vitest.dev/guide/ |
| Testing Library priority | https://testing-library.com/docs/queries/about#priority |
| MSW | https://mswjs.io/docs/ |
| Tailwind CSS v4 | https://tailwindcss.com/docs |
| Storybook 10 | https://storybook.js.org/docs |
| FastAPI | https://fastapi.tiangolo.com/ |
| Haystack | https://docs.haystack.deepset.ai/docs/intro |
| Schema.org | https://schema.org/docs/full.html |

## Project Structure

```
project-frontend-team/
  frontend/
    src/
      components/         # UI by domain (auth/, chat/, settings/, shell/, work/, ui/)
      hooks/              # Custom React hooks (use-*.ts)
      lib/                # Utilities (api-client, serializer, format, auth)
      model/              # Domain types (types.ts, canonical-id.ts, factories.ts)
      docs/               # Storybook MDX pages (product/, design/, engineering/, flows/)
      test/               # Test infrastructure (MSW handlers, fixtures, setup)
    e2e/
      tests/              # Playwright (*-mocked.spec.ts = integration, *.spec.ts = E2E)
      pages/              # Page objects
  backend/
    app/                  # FastAPI (routes/, chat/, email/, imports/, validation/)
    tests/                # pytest
    alembic/              # DB migrations
  agents/
    copilot.py            # Main copilot agent logic
    prompts/de/           # Jinja2 prompt templates (German)
  packages/core/          # Shared SDK / CLI
```

## Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| Components | PascalCase.tsx | `EditableTitle.tsx` |
| Hooks | kebab-case.ts | `use-items.ts` |
| Utils | kebab-case.ts | `api-client.ts` |
| Tests | `*.test.ts(x)` | `use-items.test.ts` |
| Stories | `*.stories.tsx` | `BucketView.stories.tsx` |
| E2E tests | kebab `*.spec.ts` | `settings-agent-mocked.spec.ts` |
| Page objects | `*.page.ts` | `settings.page.ts` |
| MDX docs | PascalCase.mdx | `Architecture.mdx` |
| Types/interfaces | PascalCase | `ActionItem`, `BaseEntity` |
| Type guards | `is` prefix | `isActionItem()`, `isProject()` |
| Hooks | `use` prefix | `useItems()`, `useMutations()` |
| Query keys | SCREAMING_SNAKE | `ITEMS_QUERY_KEY` |
| CSS | Tailwind utility | `cn("flex-1", className)` |
| Import alias | `@/` | `@/lib/api-client`, `@/model/types` |
| Backend modules | snake_case.py | `api_client.py` |

## Anti-patterns (Don't Do This)

- **Don't use `autoFocus`** — triggers eslint `set-state-in-effect`. Use `useEffect` + `ref` instead.
- **Don't nest interactive elements** — `role="button"` div containing `<a>` = nested-interactive a11y violation.
- **Don't use `setState` inside `useEffect`** — use derived state (`displayValue = editText ?? serverValue`).
- **Don't use colons in MSW URL patterns** — canonical IDs like `urn:app:reference:foo` break path-to-regexp. Escape or use `*` wildcard.
- **Don't use `npx vitest`** (watch mode) — always `CI=1 npx vitest run`.
- **Don't use `tsc --noEmit`** — must use `tsc -b --noEmit` (project references).
- **Don't use DELETE endpoints** — no-delete policy. Use archive (soft delete with `archived_at`).
- **Don't reach for Redux/Zustand** — TanStack Query is the state layer. Server state lives in the query cache.
- **Don't mock `@/hooks/use-items` without `ITEMS_QUERY_KEY`** — include it in the mock factory.
- **Don't import `userEvent` in Storybook play functions** — use the `userEvent` from the play function context parameter.

## Code Patterns (reference snippets)

### Hook pattern (TanStack Query + memoized derived data)

```typescript
// hooks/use-inbox-items.ts — thin wrapper over useAllItems
export function useInboxItems() {
  const query = useAllItems();
  const items = useMemo<ActionItem[]>(
    () => query.data.filter((t) => t.bucket === "inbox"),
    [query.data],
  );
  return { ...query, data: items };
}
```

### Component pattern (config-driven + cn utility)

```typescript
// components/paperclip/BucketBadge.tsx
export interface BucketBadgeProps {
  bucket: Bucket;
  showLabel?: boolean;
  className?: string;
}

export function BucketBadge({ bucket, showLabel = true, className }: BucketBadgeProps) {
  const config = bucketConfig[bucket];
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
      config.className, className,
    )}>
      <Icon name={config.icon} size={12} />
      {showLabel && config.label}
    </span>
  );
}
```

## Storybook (Single Source of Truth)

Storybook is the **living documentation hub** — product specs, design system, engineering architecture, and interactive component demos all live here as MDX pages alongside component stories.

```bash
cd frontend && npm run storybook       # Dev server at http://<PROJECT_PREFIX>.localhost:6006
cd frontend && npm run build-storybook  # Static build
```

### Documentation structure (`frontend/src/docs/`)

| Directory      | Content                                                                               |
| -------------- | ------------------------------------------------------------------------------------- |
| `product/`     | Vision, methodology, epics, feature specs                                             |
| `design/`      | Design philosophy, Paperclip principles, design tokens, component catalog             |
| `engineering/` | Architecture, data model, schema reference, FRBR/LexCEL ontology, deployment, routing |
| `flows/`       | End-to-end user journeys (Collect-to-Engage)                                          |

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

# Agents checks (run from agents/)
cd agents
uv run ruff check .                    # Linting
uv run ruff format --check .           # Format check
uv run mypy .                          # Type checking
uv run python -m pytest tests/         # Tests (4 tests)

# Frontend checks (run from frontend/)
cd frontend
npx eslint src/                        # Linting
npx prettier --check src/              # Format check
npx tsc -b --noEmit                    # Type checking (uses project references)
```

**Rules:**

- Fix ALL errors before marking a task as done
- Don't ignore linter warnings - they often catch real bugs
- If you modify Python files, run ruff + mypy on affected files
- If you modify TypeScript files, run eslint + prettier + tsc on affected files
- When adding i18n keys, add to BOTH `en` and `de` in `frontend/src/lib/messages.ts`

## Test Commands

```bash
cd frontend && CI=1 npx vitest run --project=unit        # Unit tests
cd frontend && npx tsc -b --noEmit                       # Type check (must use -b)
cd frontend && npm run test:e2e                           # Integration + E2E
cd backend && uv run python -m pytest                     # Backend tests
cd agents && uv run python -m pytest tests/               # Agents tests
```

Always use `CI=1 npx vitest run` (not `npx vitest` which starts watch mode). Full test reference: [Engineering / Testing](?path=/docs/engineering-testing--docs)

### Test Layer Naming (Playwright)

Playwright tests live in `frontend/e2e/tests/` and follow a 4-layer model:

| Layer           | File Pattern              | What's Mocked          |
| --------------- | ------------------------- | ---------------------- |
| **Integration** | `*-mocked.spec.ts`       | LLM inference (`page.route()`) |
| **E2E**         | `*.spec.ts` (no `-mocked`) | Nothing — full real stack |

- `npm run test:e2e` runs the `chromium` project (all tests except `*-llm.spec.ts`)
- `npm run test:e2e:llm` runs the `llm` project (real LLM E2E, needs `OPENROUTER_API_KEY`)
- Integration tests are fast, deterministic, and run in CI without API keys
- E2E LLM tests use structural assertions (not exact text) due to LLM non-determinism

## MSW (Mock Service Worker)

Storybook stories use MSW to intercept API requests in-browser, enabling "connected" stories that exercise real hooks and serialization.

- **Handlers**: `frontend/src/test/msw/handlers.ts` — in-memory store with handlers for Items, Files, Imports, Auth APIs
- **Fixtures**: `frontend/src/test/msw/fixtures.ts` — `store`, `seedMixedBuckets()`, `createItemRecord()`, `buildSyncResponse()`
- **Worker setup**: `frontend/.storybook/msw-setup.ts` — `setupWorker(...handlers)` from `msw/browser`
- **Vitest lifecycle**: `frontend/.storybook/vitest.setup.ts` — `beforeAll(worker.start)`, `afterEach(worker.resetHandlers)`, `afterAll(worker.stop)`
- **Preview**: `frontend/.storybook/preview.tsx` — conditional start (skips in vitest mode), per-story handler overrides via `parameters.msw.handlers`

**Handler URL patterns**: Use wildcard prefix `*/path` (e.g. `*/items/sync`) because `VITE_API_BASE_URL` makes fetch URLs absolute. MSW needs wildcards to match any origin.

**Per-story overrides**: Use `parameters.msw.handlers` array — the preview loader applies them via `worker.use()`. Cleaned up by `afterEach(worker.resetHandlers)` in tests.

**Streaming endpoints (NDJSON)**: The `/chat/completions` handler must return `application/x-ndjson` with `StreamEvent` objects (`text_delta`, `tool_calls`, `done`), not plain JSON. The `/chat/execute-tool` handler must persist created items to `store.items` via `createItemRecord()` so connected stories can verify tool results.

## i18n

- Frontend: `getMessage(key, locale?)` in `frontend/src/lib/messages.ts` — single file with inline `{en, de}` objects per key.
- Backend prompts: Jinja2 templates in `agents/prompts/de/`. Use `load_prompt(path, **vars)`.
- Backend errors: `AppError(code, message, status)` -> structured JSON `{"code", "message"}`.
- Full reference: [Engineering / i18n](?path=/docs/engineering-i18n--docs)

## Dev Hostname

Dev stack uses `${PROJECT_PREFIX}.localhost` (e.g. `copilot.localhost`) as the hostname for browser-facing services (frontend, storybook, API). This gives each project a unique URL for 1Password and avoids cross-site cookie issues. All URLs derive from `PROJECT_PREFIX` in `.env`. Backend/agents server-to-server calls still use plain `localhost`.

## API Documentation

- **OpenAPI UI**: `http://<PROJECT_PREFIX>.localhost:8000/docs` (e.g. `http://copilot.localhost:8000/docs`)

## GitHub

- **CLI**: Use `gh` for repository operations — issues, pull requests, labels, milestones, releases.
- **Issue tracking**: Create GitHub issues for open/unvalidated work, features pending human testing, or tasks that need follow-up. This keeps work visible even when not yet code-complete.
- Don't push unless explicitly asked.
- Don't amend commits unless explicitly asked.
- Don't force-push.

<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **project-backend-team** (14657 symbols, 37628 relationships, 300 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/refactoring/SKILL.md` |

## Tools Reference

| Tool | What it gives you |
|------|-------------------|
| `query` | Process-grouped code intelligence — execution flows related to a concept |
| `context` | 360-degree symbol view — categorized refs, processes it participates in |
| `impact` | Symbol blast radius — what breaks at depth 1/2/3 with confidence |
| `detect_changes` | Git-diff impact — what do your current changes affect |
| `rename` | Multi-file coordinated rename with confidence-tagged edits |
| `cypher` | Raw graph queries (read `gitnexus://repo/{name}/schema` first) |
| `list_repos` | Discover indexed repos |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource | Content |
|----------|---------|
| `gitnexus://repo/{name}/context` | Stats, staleness check |
| `gitnexus://repo/{name}/clusters` | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->
