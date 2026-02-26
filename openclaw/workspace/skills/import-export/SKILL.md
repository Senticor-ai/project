---
name: import-export
description: Import data from Nirvana or Senticor exports, export workspace data
user-invocable: false
---

# Import & Export

Die App hat eine eingebaute Import/Export-Funktion unter **Einstellungen > Import / Export**
(URL: `/settings/import-export`).

## Unterstuetzte Import-Quellen

- **Senticor Project** (Native) — Re-Import eines Senticor-JSON-Exports
- **Nirvana** (NirvanaHQ) — Import aus der NirvanaHQ-GTD-App (JSON-Export)

## Import-Ablauf (UI)

1. Nutzer geht zu Einstellungen > Import / Export
2. Waehlt Import-Quelle (Senticor Project oder Nirvana)
3. Laedt JSON-Datei hoch
4. Sieht Vorschau (Bucket-Verteilung, Anzahl, Fehler)
5. Bestaetigt Import → laeuft im Hintergrund
6. Ergebnis: Zusammenfassung mit erstellt/aktualisiert/uebersprungen

Duplikate werden automatisch per SHA256-Hash erkannt.
Optional koennen erledigte Eintraege mitimportiert werden (`include_completed`).

## Import via API

### Datei hochladen (3-Schritt chunked Upload)

```bash
# 1. Upload initiieren
exec curl -s -X POST "$COPILOT_BACKEND_URL/files/initiate" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -d '{"filename": "nirvana-export.json", "content_type": "application/json", "total_size": 15000}'

# Antwort: {"upload_id": "...", "upload_url": "/files/upload/{upload_id}", "chunk_size": 5242880, "chunk_total": 1}

# 2. Chunk hochladen
exec curl -s -X PUT "$COPILOT_BACKEND_URL/files/upload/{upload_id}" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "X-Chunk-Index: 0" \
  -H "X-Chunk-Total: 1" \
  --data-binary @nirvana-export.json

# 3. Upload abschliessen
exec curl -s -X POST "$COPILOT_BACKEND_URL/files/complete" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -d '{"upload_id": "{upload_id}"}'

# Antwort: {"file_id": "...", "sha256": "..."}
```

### Nirvana-Import (Vorschau + Import)

```bash
# Vorschau (Dry-Run)
exec curl -s -X POST "$COPILOT_BACKEND_URL/imports/nirvana/inspect" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "{file_id}",
    "source": "nirvana",
    "include_completed": false,
    "update_existing": true,
    "state_bucket_map": {"0": "inbox", "1": "next", "2": "waiting", "3": "calendar", "4": "someday"},
    "default_bucket": "inbox"
  }'

# Import starten
exec curl -s -X POST "$COPILOT_BACKEND_URL/imports/nirvana/from-file" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "{file_id}",
    "source": "nirvana",
    "include_completed": false,
    "update_existing": true,
    "emit_events": true,
    "state_bucket_map": {"0": "inbox", "1": "next", "2": "waiting", "3": "calendar", "4": "someday"},
    "default_bucket": "inbox"
  }'
```

### Native-Import (Senticor-Export)

```bash
# Vorschau
exec curl -s -X POST "$COPILOT_BACKEND_URL/imports/native/inspect" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -d '{"file_id": "{file_id}", "source": "native", "include_completed": false, "update_existing": true}'

# Import starten
exec curl -s -X POST "$COPILOT_BACKEND_URL/imports/native/from-file" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -d '{"file_id": "{file_id}", "source": "native", "include_completed": true, "update_existing": true, "emit_events": true}'
```

### Import-Jobs verwalten

```bash
# Alle Jobs abfragen
exec curl -s "$COPILOT_BACKEND_URL/imports/jobs" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# Einzelnen Job abfragen (Polling)
exec curl -s "$COPILOT_BACKEND_URL/imports/jobs/{job_id}" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# Fehlgeschlagenen Job wiederholen
exec curl -s -X POST "$COPILOT_BACKEND_URL/imports/jobs/{job_id}/retry" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# Job archivieren
exec curl -s -X POST "$COPILOT_BACKEND_URL/imports/jobs/{job_id}/archive" \
  -H "Authorization: Bearer $(cat /runtime/token)"
```

## Nirvana State-Mapping

Nirvana-States werden auf Buckets abgebildet:

| Nirvana State | Bucket   |
|---------------|----------|
| 0 (Inbox)     | inbox    |
| 1 (Next)      | next     |
| 2 (Waiting)   | waiting  |
| 3 (Scheduled) | calendar |
| 4 (Someday)   | someday  |
| 6 (Trashed)   | (skip)   |

Nirvana-Typen: `type=0` → Action, `type=1` → Project.

## Export

Export ist einfacher — der Nutzer klickt auf "Exportieren" in den Einstellungen.
Optionen: mit/ohne archivierte Items, mit/ohne erledigte Items.
