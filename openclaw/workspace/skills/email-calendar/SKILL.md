---
name: email-calendar
description: Email sync and calendar integration in Senticor Project
user-invocable: false
---

# E-Mail & Kalender Integration

Senticor Project hat eine Gmail- und Google-Calendar-Integration.
Nutzer verbinden ihr Google-Konto unter **Einstellungen > E-Mail** (`/settings/email`).

## Funktionsumfang

### E-Mail-Sync
- Neue Gmail-Nachrichten werden als Inbox-Items importiert (`@type: EmailMessage`)
- Sync via Google Pub/Sub Push-Notifications (~5-10s Latenz) + periodischem Polling (alle 5 Min)
- Bidirektionales Archivieren: Archivieren in der App → Gmail-Inbox entfernt; Archivieren in Gmail → App-Item archiviert
- Mark-as-Read Option: Importierte E-Mails in Gmail als gelesen markieren

### Kalender-Sync
- Google Calendar Events werden als Items mit `bucket: calendar` gespeichert
- Per-User Kalenderauswahl (welche Google-Kalender synchronisiert werden)
- RSVP-Status (accepted, tentative, declined) wird bidirektional synchronisiert
- Event-Updates (Name, Beschreibung, Datum) werden zurueck an Google propagiert

## API-Endpoints

### OAuth & Verbindung

```bash
# OAuth-URL abrufen (Nutzer muss im Browser oeffnen)
exec curl -s "$COPILOT_BACKEND_URL/email/oauth/gmail/authorize" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# Aktive Verbindungen auflisten
exec curl -s "$COPILOT_BACKEND_URL/email/connections" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# Verbindungsdetails abrufen
exec curl -s "$COPILOT_BACKEND_URL/email/connections/{connection_id}" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# Verfuegbare Kalender einer Verbindung auflisten
exec curl -s "$COPILOT_BACKEND_URL/email/connections/{connection_id}/calendars" \
  -H "Authorization: Bearer $(cat /runtime/token)"
```

### Sync & Einstellungen

```bash
# Manuellen Sync ausloesen
exec curl -s -X POST "$COPILOT_BACKEND_URL/email/connections/{connection_id}/sync" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# Verbindungseinstellungen aendern (Sync-Intervall, Mark-as-Read, Kalender)
exec curl -s -X PATCH "$COPILOT_BACKEND_URL/email/connections/{connection_id}" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -d '{"mark_as_read": true, "selected_calendars": ["primary", "calendar-id-2"]}'
```

### Kalender-Events (via CLI)

```bash
# Events auflisten
project-cli calendar list --date-from 2026-03-01 --date-to 2026-03-07

# Event-Details aendern
project-cli calendar patch <canonical-id> --name "Neuer Titel" --start-date 2026-03-01T10:00Z

# RSVP setzen
project-cli calendar rsvp <canonical-id> --status accepted
```

### Vorschlaege (Proposals)

Die App generiert Vorschlaege basierend auf E-Mails und Kalender-Events:

```bash
# Vorschlaege generieren lassen
exec curl -s -X POST "$COPILOT_BACKEND_URL/email/proposals/generate" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# Vorschlaege auflisten
exec curl -s "$COPILOT_BACKEND_URL/email/proposals" \
  -H "Authorization: Bearer $(cat /runtime/token)"

# Vorschlag bestaetigen
exec curl -s -X POST "$COPILOT_BACKEND_URL/email/proposals/{proposal_id}/confirm" \
  -H "Authorization: Bearer $(cat /runtime/token)"
```

## Wann verwenden

- Wenn der Nutzer E-Mails importieren oder synchronisieren moechte → Einstellungen > E-Mail
- Wenn der Nutzer Kalender-Events verwalten moechte → Calendar-Bucket oder CLI
- Wenn der Nutzer nach ungelesenen E-Mails oder Terminen fragt → Items im Calendar/Inbox-Bucket lesen
- Wenn der Nutzer OAuth-Probleme hat → Verbindungsstatus pruefen
