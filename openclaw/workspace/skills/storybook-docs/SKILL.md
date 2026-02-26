---
name: storybook-docs
description: Read product, design, and engineering documentation from Storybook
user-invocable: false
---

# Storybook-Dokumentation

Storybook ist die zentrale Dokumentationsquelle fuer Senticor Project.
Es enthaelt Produkt-, Design- und Engineering-Dokumentation als MDX-Seiten.

## Zugriff

### Via HTTP (Storybook Dev Server)

```bash
# Storybook-Index abrufen (verfuegbare Stories und Docs)
exec curl -s "$COPILOT_STORYBOOK_URL/index.json" | head -c 3000
```

### Via Dateisystem (wenn /project gemountet)

Alle MDX-Docs liegen unter `/project/frontend/src/docs/`:

```bash
# Alle verfuegbaren Docs auflisten
exec find /project/frontend/src/docs -name "*.mdx" -type f | sort

# Einzelne Datei lesen
exec cat /project/frontend/src/docs/product/ProductVision.mdx
```

## Dokumentationsstruktur

| Verzeichnis | Inhalt |
|-------------|--------|
| `product/` | Produktvision, Methodik, Epics, Feature-Spezifikationen, Roadmap |
| `design/` | Design-Philosophie, Paperclip-Prinzipien, Design-Tokens, CopilotUX |
| `engineering/` | Architektur, Datenmodell, Schema-Referenz, Deployment, Testing, i18n |
| `flows/` | End-to-End User Journeys (Collect-to-Engage, Copilot-Chat, Tax-Prep) |

## Wichtige Dokumentseiten

### Produkt
- `ProductVision.mdx` — Kernvision, 5-Phasen-Methodik, Zielgruppen
- `FeatureMap.mdx` — Vollstaendige Feature-Inventur mit Status
- `RoadmapProjects.mdx` — Copilot V3 Roadmap, geplante Features
- `Methodology.mdx` — GTD-basierte Capture→Clarify→Organize→Reflect→Engage Methodik

### Design
- `DesignPhilosophy.mdx` — Design-Prinzipien
- `PaperclipPrinciples.mdx` — 8 Paperclip-Designprinzipien (inkl. "AI is contributor, not authority")
- `CopilotUX.mdx` — Copilot-Persoenlichkeit, Chat-Panel-Layout, Interaktionsmuster

### Engineering
- `Architecture.mdx` — C4-Diagramme, Tech-Stack-Uebersicht
- `DataModel.mdx` — Datenmodell, JSON-LD Schema, Entity-Typen
- `ImportArchitecture.mdx` — Import-System-Architektur (Nirvana, Native)
- `EmailIntegration.mdx` — Gmail/Calendar-Integration, OAuth, Sync-Strategie
- `AgentsService.mdx` — Copilot + OpenClaw Dual-Agent-Architektur
- `Testing.mdx` — Test-Layer-Modell, Vitest + Playwright Konventionen
- `SchemaReference.mdx` — JSON-LD Schema.org Referenz

### Flows
- `CopilotChatFlow.mdx` — Chat-Phasen, Komponenten-Interaktion
- `CollectToEngage.mdx` — End-to-End Journey von Capture bis Engagement
- `TaxPrepJourney.mdx` — Steuererklaerung-Use-Case

## Wann verwenden

- Wenn der Nutzer nach Architektur, Datenmodell, Features oder Design fragt
- Wenn du den Kontext einer Feature-Entscheidung verstehen musst
- Wenn du die korrekte API-Nutzung oder Schema-Struktur nachschlagen willst
- Wenn der Nutzer nach der Produktvision oder Methodik fragt
