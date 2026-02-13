---
name: tay-backend-api
description: Create items, projects, and references in TerminAndoYo
user-invocable: false
metadata:
  openclaw:
    requires:
      env: [TAY_BACKEND_URL, TAY_DELEGATED_TOKEN]
---

# Backend API for TerminAndoYo

Du hast Zugriff auf die TerminAndoYo Backend-API.
Verwende `exec` mit `curl`, um Items zu erstellen.

## Authentifizierung

Alle Requests benötigen:
```
Authorization: Bearer $TAY_DELEGATED_TOKEN
```

## Aktion erstellen

```bash
curl -s -X POST "$TAY_BACKEND_URL/items" \
  -H "Authorization: Bearer $TAY_DELEGATED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "@context": "https://schema.org",
    "@type": "Action",
    "name": "Aktion-Name",
    "app:bucket": "next"
  }'
```

Gültige Buckets: `inbox`, `next`, `waiting`, `calendar`, `someday`

## Referenz erstellen

```bash
curl -s -X POST "$TAY_BACKEND_URL/items" \
  -H "Authorization: Bearer $TAY_DELEGATED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": "Referenz-Name",
    "app:bucket": "reference",
    "description": "Optionale Beschreibung"
  }'
```

## Projekt erstellen (Projekt + Aktionen)

Erstelle zuerst das Projekt, dann die Aktionen mit `app:projectId`:

```bash
# 1. Projekt
curl -s -X POST "$TAY_BACKEND_URL/items" \
  -H "Authorization: Bearer $TAY_DELEGATED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "@context": "https://schema.org",
    "@type": "Action",
    "name": "Projekt-Name",
    "app:bucket": "next",
    "app:desiredOutcome": "Gewünschtes Ergebnis"
  }'

# 2. Aktionen (project_id aus der Antwort verwenden)
curl -s -X POST "$TAY_BACKEND_URL/items" \
  -H "Authorization: Bearer $TAY_DELEGATED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "@context": "https://schema.org",
    "@type": "Action",
    "name": "Schritt 1",
    "app:bucket": "next",
    "app:projectId": "<canonical_id_from_project>"
  }'
```

## Antwortformat

Erfolgreiche Erstellung liefert:
```json
{
  "canonical_id": "uuid",
  "version": 1,
  "name": "..."
}
```
