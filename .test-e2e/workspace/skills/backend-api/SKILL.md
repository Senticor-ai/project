---
name: backend-api
description: Create items, projects, and references in TerminAndoYo
user-invokable: false
---

# Backend API for TerminAndoYo

Du hast Zugriff auf die TerminAndoYo Backend-API.
Verwende `exec` mit `curl`, um Items zu erstellen.

## Authentifizierung

Der aktuelle Token liegt in `/runtime/token`. Verwende ihn so in jedem Request:

```
Authorization: Bearer $(cat /runtime/token)
```

Die Backend-URL ist: `http://host.docker.internal:8000`

## Wichtig: Payload-Format

Alle POST-Requests an `/items` erwarten dieses Format:

```json
{
  "source": "tay",
  "item": { ... JSON-LD ... }
}
```

Jedes Item braucht eine `@id` als URN. Erzeuge sie mit UUID:
- Aktionen: `urn:app:action:<uuid>`
- Referenzen: `urn:app:reference:<uuid>`
- Projekte: `urn:app:project:<uuid>`

Verwende `$(cat /proc/sys/kernel/random/uuid)` fuer UUIDs.

## Aktion erstellen

```bash
exec curl -s -X POST "http://host.docker.internal:8000/items" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -H "X-Agent: tay" \
  -d '{
    "source": "tay",
    "item": {
      "@id": "urn:app:action:'"$(cat /proc/sys/kernel/random/uuid)"'",
      "@type": "Action",
      "_schemaVersion": 2,
      "name": "Aktion-Name",
      "additionalProperty": [
        {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
        {"@type": "PropertyValue", "propertyID": "app:rawCapture", "value": "Aktion-Name"}
      ]
    }
  }'
```

Gueltige Buckets: `inbox`, `next`, `waiting`, `calendar`, `someday`

## Referenz erstellen

```bash
exec curl -s -X POST "http://host.docker.internal:8000/items" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -H "X-Agent: tay" \
  -d '{
    "source": "tay",
    "item": {
      "@id": "urn:app:reference:'"$(cat /proc/sys/kernel/random/uuid)"'",
      "@type": "CreativeWork",
      "_schemaVersion": 2,
      "name": "Referenz-Name",
      "description": "Optionale Beschreibung",
      "additionalProperty": [
        {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "reference"}
      ]
    }
  }'
```

## Projekt erstellen (Projekt + Aktionen)

Erstelle zuerst das Projekt, dann die Aktionen mit `app:projectRefs`:

```bash
# 1. Projekt erstellen
exec curl -s -X POST "http://host.docker.internal:8000/items" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -H "X-Agent: tay" \
  -d '{
    "source": "tay",
    "item": {
      "@id": "urn:app:project:'"$(cat /proc/sys/kernel/random/uuid)"'",
      "@type": "Project",
      "_schemaVersion": 2,
      "name": "Projekt-Name",
      "additionalProperty": [
        {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "project"},
        {"@type": "PropertyValue", "propertyID": "app:desiredOutcome", "value": "Gewuenschtes Ergebnis"},
        {"@type": "PropertyValue", "propertyID": "app:projectStatus", "value": "active"}
      ]
    }
  }'

# 2. canonical_id aus der Antwort notieren, dann Aktionen erstellen:
exec curl -s -X POST "http://host.docker.internal:8000/items" \
  -H "Authorization: Bearer $(cat /runtime/token)" \
  -H "Content-Type: application/json" \
  -H "X-Agent: tay" \
  -d '{
    "source": "tay",
    "item": {
      "@id": "urn:app:action:'"$(cat /proc/sys/kernel/random/uuid)"'",
      "@type": "Action",
      "_schemaVersion": 2,
      "name": "Schritt 1",
      "additionalProperty": [
        {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
        {"@type": "PropertyValue", "propertyID": "app:rawCapture", "value": "Schritt 1"},
        {"@type": "PropertyValue", "propertyID": "app:projectRefs", "value": ["<canonical_id_from_project>"]}
      ]
    }
  }'
```

## Antwortformat

Erfolgreiche Erstellung liefert:

```json
{
  "item_id": "uuid",
  "canonical_id": "urn:app:...",
  "source": "tay",
  "item": { ... },
  "created_at": "...",
  "updated_at": "..."
}
```
