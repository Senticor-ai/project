---
name: project-cli
description: Senticor Project CLI for item management, triage, focus, and project operations
user-invocable: false
---

# Senticor Project CLI

Die CLI ist verfuegbar unter `/project/packages/core/cli/index.ts`.
Aufruf: `npx tsx /project/packages/core/cli/index.ts [command] [options]`

Fuer aktuelle Hilfe:
```bash
exec npx tsx /project/packages/core/cli/index.ts --help
```

## Globale Optionen

| Option | Beschreibung |
|--------|-------------|
| `--host <url>` | Backend-Host (default: `$COPILOT_BACKEND_URL` oder `http://localhost:8000`) |
| `--org-id <id>` | Tenant-Org-ID (X-Org-Id Header) |
| `--json` | Maschinenlesbare JSON-Ausgabe |
| `--non-interactive` | Keine interaktiven Prompts |
| `--yes` | Destruktive Aktionen automatisch bestaetigen |
| `--no-color` | Keine ANSI-Farben |

## Item-Befehle

### `items create`
Erstellt eine Aktion, Referenz oder ein Event.

```bash
items create --type Action --name "Steuern pruefen" --bucket next --apply
items create --type CreativeWork --name "Notiz" --description "..." --bucket reference --apply
items create --type Event --name "Meeting" --start-date 2026-03-01T10:00Z --end-date 2026-03-01T11:00Z --apply
items create --type Action --name "Aufgabe" --bucket next --project <project-id> --apply
```

Verfuegbare `--type` Werte:
- **Action** (bucket: inbox, next, waiting, calendar, someday) — Felder: `--name`, `--bucket`, `--due-date`
- **Project** (status: active, completed, on-hold, archived) — Felder: `--name`, `--description`
- **CreativeWork** (bucket: reference) — Felder: `--name`, `--description`
- **DigitalDocument** (bucket: reference) — Felder: `--name`
- **Person** (bucket: reference) — Felder: `--name`
- **Event** (bucket: calendar) — Felder: `--name`, `--start-date`, `--end-date`

### `items triage`
Verschiebt ein Item in einen anderen Bucket.

```bash
items triage <item-id> --bucket next --apply
items triage <item-id> --bucket someday --apply
```

### `items focus`
Setzt oder entfernt den Fokus auf einem Item.

```bash
items focus <item-id> --on --apply
items focus <item-id> --off --apply
```

## Projekt-Befehle

### `projects create`
Erstellt ein neues Projekt.

```bash
projects create --name "Steuererklaerung 2025" --desired-outcome "Abgabe bis 31.07." --apply
```

### `projects actions create`
Erstellt eine Aktion innerhalb eines Projekts.

```bash
projects actions create --project <project-id> --name "Belege sammeln" --bucket next --apply
```

### `projects actions update`
Aktualisiert eine Projektaktion.

```bash
projects actions update --project <project-id> --action <action-id> --name "Neuer Name" --apply
```

### `projects actions transition`
Aendert den Status einer Projektaktion.

```bash
projects actions transition --project <project-id> --action <action-id> --status completed --apply
```

### `projects actions comments add`
Fuegt einen Kommentar zu einer Projektaktion hinzu.

```bash
projects actions comments add --project <project-id> --action <action-id> --text "Kommentar" --apply
```

### `projects actions comments reply`
Antwortet auf einen Kommentar.

```bash
projects actions comments reply --project <project-id> --action <action-id> --comment <comment-id> --text "Antwort" --apply
```

## Kalender-Befehle

### `calendar list`
Listet Kalender-Events.

```bash
calendar list --date-from 2026-03-01 --date-to 2026-03-07 --limit 50
```

### `calendar patch`
Aktualisiert ein Kalender-Event.

```bash
calendar patch <canonical-id> --name "Neuer Titel" --start-date 2026-03-01T10:00Z
```

### `calendar rsvp`
Setzt den RSVP-Status eines Events.

```bash
calendar rsvp <canonical-id> --status accepted
calendar rsvp <canonical-id> --status declined
```

## Vorschlaege

### `proposals apply`
Wendet Vorschlaege an (z.B. E-Mail-Vorschlaege).

```bash
proposals apply --apply
```

## Wichtige Regeln

- Schreibbefehle immer mit `--apply` ausfuehren.
- Fuer `projects actions *` immer `--project <id>` und (wo noetig) `--action <id>` explizit setzen.
- Keine Positionsargumente fuer Aktions-IDs verwenden.
- Bei Fragen ueber verfuegbare Befehle: `--help` verwenden.
