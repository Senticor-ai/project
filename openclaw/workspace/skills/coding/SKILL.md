---
name: coding
description: Run tests, lint, format, type-check, and manage git in the project
user-invocable: false
metadata: { "openclaw": { "requires": { "bins": ["node", "python3", "git"] } } }
---

# Coding & Entwicklung

Dieses Projekt ist unter `/project/` gemountet (wenn Devcontainer aktiv).
Du kannst Code lesen, aendern, testen und pruefen.

## Projektstruktur

```
/project/
  frontend/           # React 19 + Vite + Tailwind v4
    src/
      components/     # UI-Komponenten nach Domain
      hooks/          # Custom React Hooks (use-*.ts)
      lib/            # Utilities (api-client, format, auth)
      model/          # Domain-Typen (types.ts, factories.ts)
      docs/           # Storybook MDX-Seiten
      test/           # Test-Infrastruktur (MSW, Fixtures)
    e2e/              # Playwright-Tests
  backend/            # FastAPI + PostgreSQL
    app/              # Routes, Chat, Email, Imports
    tests/            # pytest
    alembic/          # DB-Migrationen
  agents/             # Haystack Copilot (Legacy)
    prompts/de/       # Jinja2 Prompt-Templates
  packages/core/      # Shared SDK / CLI
  openclaw/           # OpenClaw Workspace + Skills
```

## Checks ausfuehren

### Frontend (TypeScript/React)

```bash
cd /project/frontend

# Type-Check (MUSS -b verwenden wegen Project References)
npx tsc -b --noEmit

# Linting
npx eslint src/

# Formatierung pruefen
npx prettier --check src/

# Unit-Tests (IMMER mit CI=1, nie ohne — startet sonst Watch-Mode)
CI=1 npx vitest run --project=unit

# E2E-Tests (Integration + End-to-End)
npm run test:e2e
```

### Backend (Python/FastAPI)

```bash
cd /project/backend

# Linting
uv run ruff check .

# Formatierung pruefen
uv run ruff format --check .

# Type-Check
uv run mypy app/

# Tests
uv run python -m pytest
```

### Agents (Python/Haystack)

```bash
cd /project/agents

# Linting + Type-Check
uv run ruff check .
uv run ruff format --check .
uv run mypy .

# Tests
uv run python -m pytest tests/
```

## Vollstaendiger Preflight-Check

```bash
cd /project/frontend && npm run preflight:local
```

Dieser Befehl fuehrt alle relevanten Checks aus. Wenn Backend-Verhalten geaendert wurde:
```bash
npm run preflight:local:strict
```

## Konventionen

### Naming
- Components: PascalCase.tsx (`EditableTitle.tsx`)
- Hooks: kebab-case.ts (`use-items.ts`)
- Tests: `*.test.ts(x)` (`use-items.test.ts`)
- E2E: `*.spec.ts` (`settings-agent-mocked.spec.ts`)

### Anti-Patterns (NICHT verwenden)
- `autoFocus` → `useEffect` + `ref` verwenden
- `setState` in `useEffect` → derived state verwenden
- `npx vitest` (Watch-Mode!) → `CI=1 npx vitest run`
- `tsc --noEmit` → `tsc -b --noEmit` (Project References)
- DELETE-Endpoints → Archivieren (Soft Delete mit `archived_at`)

### Sprache
- Code: Englisch
- UI-Strings: Deutsch + Englisch (i18n, `getMessage()`)
- Prompts: Deutsch
- Commits/PRs: Englisch

## Git

```bash
# Status pruefen
cd /project && git status

# Branch erstellen
git checkout -b feature/my-feature

# Commit (niemals --no-verify oder --amend ohne explizite Anfrage)
git commit -m "description of change"

# PR erstellen
gh pr create --title "Title" --body "Description"
```

Regeln:
- Nie pushen oder committen ohne explizite Nutzeranfrage
- Nie force-push
- Nie --amend ohne Anfrage
- Kein `git add .` — spezifische Dateien stagen
