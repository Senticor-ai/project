# German examples

This folder groups all German-language fixtures by type.

## Layout

- `cases/`: Case dossiers (multi-doc inputs used for case import/tests)
- `contexts/`: Legal/knowledge contexts (source documents for composable seeding)
- `emails/`: Email-only examples (one `email.md` per folder)

## Naming

- Use short, lowercase, ASCII slugs for folder names.
- Avoid repeating the language in folder names (already implied by `german/`).
- Prefer stable, descriptive names (e.g. `buergergeld`, `uvp2`, `anerkennung_einrichtung_Jugendhilfe`).

## Email-only examples

Each email example lives in its own folder with a single `email.md`:

```
fixtures/german/emails/<slug>/email.md
```

## Adding new examples

- Place German case dossiers in `cases/<slug>/`.
- Place German legal/knowledge contexts in `contexts/<slug>/`.
- Place single-email samples in `emails/<slug>/email.md`.
