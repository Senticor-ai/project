# Positionspapier: Rechtsreferenz-Normalisierung für den deutschen Rechtsraum
## Warum Deutschland eine offene, maschinenlesbare Rechtsinfrastruktur braucht

*Diskussionspapier für Entscheider:innen in Justiz, Verwaltung und Legal Tech (November 2025)*

---

## Executive Summary

Deutschland verfügt über keine einheitliche, maschinenlesbare Infrastruktur für Rechtsverweise. Das macht KI-gestützte Rechtsinformationssysteme praktisch unmöglich, kostet täglich Tausende Arbeitsstunden und verhindert den gleichberechtigten Zugang zu strukturierter Rechtsinformation. Wir schlagen ein offenes, gemeinschaftlich gepflegtes Datenprodukt vor – finanziert und getragen von öffentlicher Hand, Wissenschaft und Legal Tech.

---

## 1. Das Problem: Warum KI-Systeme mit deutschem Recht scheitern

### 1.1 Die juristische Praxis: Inkonsistenz, Mehrdeutigkeit, fehlende Maschinenlesbarkeit

Juristen arbeiten täglich mit Rechtsverweisen, die in der Praxis – und besonders für KI-Systeme – erhebliche Probleme verursachen:

**Problem 1: Inkonsistente Zitierweisen**

Ein und dieselbe Norm wird unterschiedlich bezeichnet:
- `SGB III`, `SGB 3`, `Drittes Buch Sozialgesetzbuch`
- `§ 159 Abs. 1 S. 2`, `§159 Absatz 1 Satz 2`, `§ 159 I 2`

Diese Varianz hat Folgen:
- **Für Juristen**: Systematische Recherchen werden erschwert, manuelle Nachverfolgung kostet 30-45 Minuten pro komplexem Fall
- **Für KI-Systeme**: Keine Suchmaschine findet alle Varianten zuverlässig, automatisierte Verweisauflösung scheitert
- **Für Bürger**: Unterschiedliche Darstellungen in verschiedenen Portalen verwirren, keine einheitliche Orientierung

**Problem 2: Mehrdeutige Verweise ohne explizite Kontextangabe**

Verwaltungsvorschriften, Weisungen und Urteile referenzieren oft unvollständig:

> *"Die Aufhebung nach § 44 Absatz 2 ist nur zulässig..."*

Gemeint ist § 44 SGB X (Rücknahme begünstigender Verwaltungsakte). Aber es gibt § 44 in SGB I (Mitwirkungspflicht), SGB III (Leistungseinschränkungen), SGB V, VI, VII, ... – jeweils mit völlig unterschiedlichem Inhalt.

**Juristischer Kontext ist implizit**: Menschen erschließen aus "Aufhebung" + "begünstigend" → SGB X. Maschinen benötigen strukturierte Kontextinformationen oder Disambiguation-Strategien mit Confidence-Scores.

**Problem 3: Fehlende Geltungsinformationen und Versionierung**

Gesetze ändern sich ständig. Aber:
- Keine maschinenlesbaren Metadaten zu Geltungszustand (`eli:in_force`), Inkrafttreten (`eli:date_applicability`)
- Aufgehobene Normen (`(weggefallen)`) werden in Altdokumenten noch zitiert
- KI-Systeme können nicht unterscheiden, ob eine Norm aktuell gilt oder aufgehoben wurde

**Konsequenz**: Risiko fehlerhafter Rechtsanwendung durch Berufung auf veraltete/aufgehobene Normen. Besonders kritisch bei KI-Chatbots ohne strukturierte Validierung.

**Problem 4: Fehlende zentrale Begriffsdefinitionen**

Zentrale Rechtsbegriffe werden in verschiedenen Gesetzen unterschiedlich definiert – ohne ein zentrales, maschinenlesbares Terminologie-Register:

**Beispiel "Arbeitslosigkeit":**
- **SGB III § 119**: Definition für Anspruch auf Arbeitslosengeld (Verfügbarkeit, Eigenbemühungen, Meldung)
- **SGB II § 7**: Andere Definition für Grundsicherung (Erwerbsfähigkeit, Hilfebedürftigkeit)

Unterschiedliche Kriterien führen zu unterschiedlichen Rechtsfolgen. Juristen wissen aus Erfahrung, welche Definition in welchem Kontext gilt. **KI-Systeme können ohne strukturierte Typisierung nicht unterscheiden**, welche Definition gemeint ist.

**Internationaler Vergleich:**
- **UK**: Government Digital Service pflegt einheitliche Terminologie im "GOV.UK Design System"
- **US**: NIST pflegt Terminologie-Register für regulatorische Texte
- **Deutschland**: Keine vergleichbare zentrale Terminologie-Infrastruktur

**Konsequenz**: Begriffe wie "Beschäftigung", "Einkommen", "Bedarfsgemeinschaft" haben je nach Gesetz unterschiedliche Bedeutungen. Systematische Abfragen ("Wie viele Gesetze definieren 'Beschäftigung'?") sind ohne manuelle Durchsicht unmöglich.

### 1.2 Das Infrastrukturproblem: Fragmentierung ohne gemeinsame Standards

Das deutsche Rechtsinformationssystem leidet unter einer fundamentalen Strukturlücke, die sich mit dem **FRBR-Modell** (Functional Requirements for Bibliographic Records) beschreiben lässt:

**Ebene 1: Das Werk (Work)** – Ein Gesetz als abstrakte Idee (z.B. "Bundesreisekostengesetz")

**Ebene 2: Die Expression** – Eine Fassung mit Änderungsstand (z.B. "BRKG i.d.F. vom 28.6.2021")

**Ebene 3: Die Manifestation** – Konkrete Veröffentlichungsformen:
- **Bundesanzeiger** (Bundesgesetzblatt) ← Amtliche Verkündung, **authoritative source**
- **Gesetze-im-Internet** (BMJV) ← Konsolidierte Fassung, Arbeitsgrundlage
- **Juris, beck-online** ← Kommerzielle Datenbanken, Recherche-Tools

**Das Problem**:

1. **Bundesanzeiger** (amtliche Quelle): Keine API, keine strukturierten Daten, keine Maschinenlesbarkeit. Hosting bei Juris, aber selbst dort nicht strukturiert abrufbar.

2. **Gesetze-im-Internet** (BMJV): XML-Dateien vorhanden, aber ohne kanonische URN/ELI-Identifikatoren, ohne maschinenlesbare Verweisstrukturen zwischen Normen.

3. **Kommerzielle Datenbanken**: Proprietär, teuer, inkompatibel untereinander. Vendor Lock-in verhindert Interoperabilität.

4. **XÖV-Standards** (IT-Planungsrat): Gute Absicht mit XJustiz und XÖV-Basistypen, aber keine flächendeckende Implementierung. Keine offene Datenbasis, keine kanonischen URNs in der Praxis.

**Konsequenz für KI-Entwicklung**:

Wer ein KI-System bauen will, das verlässlich mit deutschen Rechtsnormen arbeitet, muss entweder:
- Selbst scrapen und normalisieren (Monate Aufwand, rechtliche Grauzone)
- Teure Lizenzen kaufen (Vendor Lock-in, keine Interoperabilität)
- Auf unstrukturierte Volltextsuche zurückfallen (keine Verweisauflösung, hohe Halluzinationsrate)

### 1.2.1 Format-Fragmentierung: Kein einheitliches Publikationsformat

Neben fehlenden APIs und proprietären Datenbanken kommt hinzu: **Jede Jurisdiktionsebene nutzt unterschiedliche Formate** – ohne gemeinsame Struktur.

**Bundesgesetze (Gesetze-im-Internet):**

XML-Format verfügbar, aber inkonsistent strukturiert. Ein konkretes Beispiel zeigt die Tragweite:

**Das Jahressuffix-Problem:**
- Gesetz: "Bundesreisekostengesetz (BRKG)" aus dem Jahr 2005
- XML-Metadaten: `<jurabk>BRKG 2005</jurabk>` (Jahr im Titel)
- Verweise im Gesetzestext: "§ 4 BRKG", "§ 5 BRKG" (ohne Jahr)
- **Maschinelle Interpretation**: System behandelt "2005" wie "III" in "SGB III" → generiert IRIs wie `urn:de:brkg:2005:4` (falsch!)
- **Erwartete IRI**: `urn:de:brkg:4`
- **Resultat**: 100% der internen Verweise nicht auflösbar (vorher), 100% auflösbar nach Korrektur

**Verwaltungsvorschriften (BA-Weisungen):**

Markdown-Format ohne standardisierte Struktur. Metadaten ("Bezug", "Zusammenfassung", "Gültig ab/bis") gemischt mit Inhalt.
- **Gemessen**: 56% mehr LLM-Verarbeitungsaufwand durch fehlende Struktur
- **Kosten-Implikation**: Ohne Optimierung $0.018 pro Weisung, optimiert $0.008 – bei 10.000 Weisungen: $180 vs. $80

**16 Bundesländer:**

Jedes Bundesland betreibt eigenes Rechtsportal mit eigenen Formaten:
- **Bayern**: HTML-basiert, keine strukturierten Daten
- **NRW**: PDF-Publikation, keine Maschinenlesbarkeit
- **Berlin**: Eigenes XML-Schema, inkompatibel zu Bund

**Konsequenz**:
- **Für KI-Entwicklung**: Kein einheitlicher Extraktor möglich. Jede Jurisdiktionsebene benötigt einen eigenen Parser – Monate Mehraufwand statt Innovation.
- **Für länderübergreifende Analysen**: Fragen wie "Welche Bundesländer haben ähnliche Regelungen zu § X?" sind **technisch unmöglich** ohne manuelle Harmonisierung.
- **Multiplier-Effekt**: Nicht ein Problem, sondern 17+ verschiedene Implementierungen (Bund + 16 Länder), die jeweils individuell gelöst werden müssen.

### 1.2.2 ID-System-Chaos: Fehlende Interoperabilität ohne "Rosetta Stone"

Deutschland nutzt **mehrere konkurrierende Identifikationssysteme** für Rechtsnormen – ohne zentrale Zuordnung oder Mapping-Service:

**Die verschiedenen ID-Systeme:**

1. **ELI (European Legislation Identifier)**: EU-weiter Standard für persistente URIs, in Deutschland nicht konsistent implementiert
2. **NorM-ID**: Geplante deutsche Norm-Identifier (IT-Planungsrat, diskutiert seit 2019), aber noch nicht operativ
3. **XML-IDs**: Interne Identifikatoren in gesetze-im-internet.de (z.B. `BJNR059500997.xml` für SGB III) – nicht persistent bei Änderungen
4. **Proprietäre IDs**: juris, beck-online, lexisnexis haben jeweils eigene Nummerierungssysteme – untereinander inkompatibel
5. **Keine IDs**: Verwaltungsvorschriften und BA-Weisungen haben häufig gar keine persistenten Identifikatoren

**Das "Rosetta Stone"-Problem:**

Es existiert **keine zentrale Stelle**, die zwischen diesen ID-Systemen übersetzt. Beispiel:
- Ein Urteil zitiert "§ 159 SGB III" mit juris-ID `BJSG123456789`
- Eine Weisung referenziert denselben Paragraphen ohne ID
- Ein Legal-Tech-Tool nutzt ELI-URI `eli/bund/bgbl-1/1997/s594/1997-03-24/1/deu/rechtsetzungsdokument-1`
- **Keine dieser Referenzen kann automatisch zugeordnet werden**

**Konsequenzen:**

- **Für Interoperabilität**: Systeme verschiedener Anbieter können Rechtsnormen nicht eindeutig abgleichen
- **Für Versionsnachverfolgung**: Wenn ein Gesetz geändert wird, kann nicht automatisch festgestellt werden, welche Version in einem Dokument gemeint ist
- **Für Provenienz**: KI-Systeme können nicht verifizieren, welche amtliche Quelle einer Regel zugrunde liegt
- **Für Integration**: Legal-Tech-Startups müssen proprietäre Mappings selbst erstellen – Monate Aufwand, keine Wiederverwendbarkeit

**Was fehlt:** Eine zentrale, öffentlich gepflegte Registry, die verschiedene ID-Systeme aufeinander abbildet – analog zu ISSNs und ISBNs im Bibliothekswesen.

### 1.3 Auswirkungen auf Rechtssicherheit und Effizienz

**Für Gerichte und Verwaltungen:**
- Durchschnittlich 30-45 Minuten Recherchezeit pro komplexem Fall
- Bei ~500.000 Widersprüchen/Jahr in der Arbeitslosenversicherung: Tausende verlorene Arbeitsstunden
- Fehlerhafte Verweise in Verwaltungsakten führen zu Widersprüchen und Klagen

**Für Legal-Tech-Startups:**
- Monate für Datenbeschaffung und Normalisierung (statt Innovation)
- Inkompatibilität zu anderen Systemen (jeder entwickelt eigene, inkompatible Logik)
- Scheitern mangels Datenzugang oder Vendor Lock-in

**Für KI-Systeme:**
- Halluzinationen nicht-existenter Rechtsnormen (keine strukturierte Validierungsgrundlage)
- Keine Nachprüfbarkeit von KI-generierten Rechtsbegründungen
- Vertrauensverlust, wenn KI falsche Paragraphen zitiert oder aufgehobene Normen anwendet

### 1.4 Die praktische Realität: KI-Integration mit deutschen Rechtstexten

Die oben beschriebenen Probleme sind nicht nur theoretisch – sie zeigen sich konkret bei der Implementierung von KI-Systemen für deutsches Recht. **Messungen aus einem aktuellen Proof-of-Concept** verdeutlichen die Dimensionen:

**Problem 1: Verweisauflösung ist komplex – trotz 5 Strategien bleiben ~20% ungelöst**

Um mehrdeutige Verweise wie "§ 44 Absatz 2" aufzulösen, wurden 5 Disambiguierungs-Strategien implementiert:
1. Explizite Übereinstimmung (95% Confidence)
2. Same-Document-Inference (90% Confidence)
3. Kontextfenster-Analyse (85% Confidence)
4. Domain-Scope-Inference (85% Confidence)
5. Statistische Priorisierung (70-80% Confidence)

**Ergebnis**: Trotz dieser aufwendigen Strategien verbleiben ~20% der Verweise als Platzhalter – nicht wegen technischer Mängel, sondern **weil die Quelldokumente strukturell mehrdeutig sind**.

**Problem 2: Skalierung ist ressourcenintensiv**

- **SGB III + 10 BA-Weisungen**: 349 Knoten benötigen LLM-Enrichment → 5-10 Minuten Verarbeitungszeit
- **Voller Katalog** (alle SGB-Bücher + alle Weisungen): Geschätzt **mehrere Stunden bis Tage**
- **Kosten**: Ohne Optimierung ~$100+ für 10.000 Weisungen
- **Mit Optimierung** (Dokumentebenen-Skipping, Metadaten-Filterung): Reduktion auf 56% der ursprünglichen LLM-Calls

**Problem 3: Cross-Document-Referenzen benötigen Namensraum-Übersetzung**

BA-Weisungen (administrative Richtlinien) referenzieren Gesetzesparagraphen, aber nutzen andere IRI-Namensräume:
- Weisung-IRI: `urn:de:ba:weisung:202511001:section:0`
- Gesetz-IRI: `urn:de:sgb:3:159`

**Lösung**: Manuelle Scope-Metadaten-Propagation erforderlich. Jede Weisung muss mit Anwendungsbereich annotiert werden, um Verweise korrekt zuzuordnen.

**Problem 4: Deutsche Rechtstexte sind strukturell für Menschen optimiert**

Der Kern des Problems:
> "Die größte Überraschung war nicht die technische Komplexität – sondern die Erkenntnis, dass **deutsche Rechtstexte strukturell für menschliche Leser optimiert sind, nicht für Maschinen**. Jede Optimierung (Jahressuffix-Entfernung, Metadaten-Filterung, Scope-Propagation) adressierte implizite Annahmen, dass Menschen Mehrdeutigkeiten durch Kontext auflösen würden."

**Konsequenz**: KI-Systeme benötigen nicht nur bessere Algorithmen, sondern **strukturierte, maschinenlesbare Quelldaten**. Ohne diese Grundlage bleiben KI-gestützte Rechtsinformationssysteme fehleranfällig und wartungsintensiv.

---

## 2. Die Lösung: Offene, strukturierte Referenz-Normalisierung

### 2.1 Kanonische URN/ELI-Identifikatoren

**Prinzip**: Jede Rechtsnorm erhält eine eindeutige, menschenlesbare URN nach ELI-Prinzipien.

**Beispiele:**
```
urn:de:sgb:3:159                    # § 159 SGB III
urn:de:sgb:3:159:1                  # § 159 Absatz 1
urn:de:sgb:3:159:1:2                # § 159 Abs. 1 Satz 2
urn:de:sgb:3:159:1:2:1              # § 159 Abs. 1 Satz 2 Nr. 1
```

**Normalisierung:**
- Römische → Arabische Ziffern (`SGB III` → `sgb:3`)
- Jahressuffixe entfernen (`BRKG 2005` → `brkg`, siehe Abschnitt 2.4)
- Unicode-Harmonisierung, Whitespace-Normalisierung
- Buchstaben-Suffixe unterstützt (`§ 54a` → `54a`)

**Vorteil**: Egal wie im Quelltext zitiert – das System erkennt die gemeinte Norm.

### 2.2 5-stufige Disambiguation mit Confidence-Scores

**Ziel**: Mehrdeutige Verweise zuverlässig auflösen und Vertrauensscores liefern.

| Strategie | Confidence | Beispiel |
|-----------|-----------|----------|
| **1. Explizite Übereinstimmung** | 0.95 | "§ 159 SGB III" → direkte Auflösung |
| **2. Same-Document-Inference** | 0.90 | Verweis im SGB III ohne Gesetz → erschließe aus Quell-Dokument |
| **3. Kontextfenster-Analyse** | 0.85 | "§ 159" + Kontext "Sperrzeit" + "SGB III" im Umfeld → SGB III |
| **4. Domain-Scope-Inference** | 0.85 | BA-Weisung mit Scope "SGB III" → unvollständige Verweise erschließen |
| **5. Statistische Priorisierung** | 0.70-0.80 | "§ 44 Abs. 2" → häufigstes in Rechtsprechung: SGB X |

**Fallback**: Wenn Confidence < 0.90, wird ein Platzhalter-Knoten erzeugt mit Kandidaten und Kontext für spätere Auflösung.

**Vorteil**: Transparente Vertrauensscores statt Black-Box – Nutzer können kritische Verweise nachprüfen.

### 2.3 Intelligente Platzhalter und Versionierung

**Platzhalter-System**: Nicht sofort auflösbare Verweise werden als strukturierte Platzhalter gespeichert:
- Kandidaten mit Scores (`urn:de:sgb:10:44:2` → 50%, `urn:de:sgb:3:44:2` → 30%)
- Kontext-Informationen für spätere LLM-basierte Auflösung
- Automatisches Merging, wenn fehlende Dokumente nachgeladen werden

**Geltungszustand** (nach ELI):
```json
{
  "@id": "urn:de:sgb:3:159",
  "eli:in_force": true,
  "eli:date_publication": "1997-03-24",
  "eli:last_modified": "2024-11-01",
  "eli:version": "2024-11-01",
  "lc:repealed": false
}
```

**Vorteil**: KI-Systeme wissen, welche Fassung gilt und können aufgehobene Normen ignorieren.

### 2.4 Spezialfall: Jahressuffixe bei Gesetzesbezeichnungen

**Problem**: Gesetze wie `BRKG 2005`, `AufenthG 2004` haben Jahressuffix im Titel (Inkrafttreten), aber Verweise im Text nutzen nur die Abkürzung (`§ 4 BRKG`).

**Fehlverhalten ohne Normalisierung**:
```
XML-Metadaten:    <jurabk>BRKG 2005</jurabk>
Generierte IRI:   urn:de:brkg:2005:5  ← Jahr als "Buchnummer" interpretiert!
Verweis im Text:  "§ 4 BRKG"
Erwartete IRI:    urn:de:brkg:4
→ Mismatch! Interne Verweise nicht auflösbar (100% orphaned)
```

**Lösung**: Regex-basierte Jahressuffix-Entfernung vor IRI-Konstruktion:
```javascript
normalized = normalized.replace(/\s+\d{4}$/, '');  // "BRKG 2005" → "BRKG"
```

**Ergebnis**: ~100% Auflösung interner Verweise (vorher: 0%).

**Juristische Begründung**: Das Jahr ist historische Metainformation (Verkündungsjahr), keine Gliederungsebene wie bei SGB-Büchern (`SGB III` = Drittes Buch). Verweise im Gesetzestext nutzen ausschließlich die Abkürzung ohne Jahr.

---

## 3. Vision: Ein gemeinschaftliches Datenprodukt

### 3.1 Warum Einzellösungen scheitern

**Status Quo**:
- Bundesjustizministerium: "Gesetze im Internet" (HTML, keine API)
- Bundesanzeiger (amtliche Quelle): Keine Maschinenlesbarkeit, bei Juris gehostet
- 16 Bundesländer: Jeweils eigene Rechtsportale, unterschiedliche Formate
- Juris/Beck: Proprietär, teuer, inkompatibel
- Legal-Tech-Startups: Jeder scrapt und normalisiert selbst

**Das führt zu**:
- **Doppelarbeit**: Jede Organisation löst dieselben Probleme neu
- **Inkompatibilität**: Daten nicht kombinierbar
- **Qualitätsprobleme**: Fehler werden nicht geteilt, keine gemeinsame Qualitätssicherung
- **Vendor Lock-in**: Abhängigkeit von kommerziellen Anbietern

### 3.2 Was ein gemeinschaftliches Produkt leisten muss

**Komponenten**:

1. **Datensatz (Open Data Hub)**
   - Alle Bundesgesetze mit kanonischen URNs
   - Landesgesetze (schrittweise Erweiterung)
   - Verwaltungsvorschriften (BA-Weisungen, etc.)
   - Format: JSON-LD, RDF/Turtle, Parquet (für ML)
   - Hosting: Hugging Face Data Hub (kostenlos, versioniert, API)

2. **Schemata und Validierung**
   - JSON-Schema, SHACL-Shapes
   - CI/CD-Pipeline: Automatische Qualitätschecks

3. **Test-Suites und Benchmarks**
   - Juristisch geprüfte Referenz-Fälle (Edge-Cases, mehrdeutige Verweise)
   - Kontinuierliche Erweiterung durch Community

4. **Tools und APIs**
   - Python/JavaScript-Libraries für IRI-Normalisierung
   - SPARQL-Endpoint, REST-API
   - Plugins für Legal-Tech-Tools

### 3.3 Governance und Finanzierung

**Governance-Modell** (Vorschlag):

**Ebene 1: Steuerungskreis (Strategisch)**
- Vertreter:innen aus Justiz, Verwaltung, Wissenschaft, Legal Tech
- Aufgaben: Strategische Ausrichtung, Standard-Entwicklung

**Ebene 2: Technische Arbeitsgruppe (Operativ)**
- Expert:innen für Ontologien, Rechtsinformatik
- Aufgaben: Schemata-Pflege, Qualitätssicherung

**Ebene 3: Community (Beiträge)**
- Alle interessierten Entwickler:innen, Jurist:innen
- Plattform: GitHub, HuggingFace Discussions

**Finanzierung**:
- **Öffentliche Förderung**: Justizministerien (Bund/Länder), EU Digital Europe Programme
- **Forschungsförderung**: DFG, BMBF (Rechtsinformatik-Projekte)
- **Trägerorganisation**: Fraunhofer, Max-Planck-Institut, oder gemeinnützige Stiftung
- **Freiwillige Beiträge**: Legal-Tech-Unternehmen (Open-Source-Modell)

**Qualitätssicherung**:
- Automatisierte Tests (JSON-Schema, SHACL, E2E)
- Juristische Validierung durch Expert:innen
- Peer Review für Pull Requests

### 3.4 Nutzen für alle Beteiligten

**Für öffentliche Verwaltung:**
- 30-40% Zeiteinsparung bei Fallbearbeitung
- Fehlerreduktion durch strukturierte Verweise
- E-Justice-Integration

**Für Legal-Tech:**
- Marktzugang ohne Monate für Datenbeschaffung
- Interoperabilität durch gemeinsame Standards
- Level Playing Field statt Vendor Lock-in

**Für Wissenschaft:**
- Empirische Rechtsforschung (Zitationsnetzwerke, Rechtsvergleich)
- Reproduzierbare Forschung auf einheitlicher Datenbasis

**Für Bürger:innen:**
- Transparente, vernetzte Rechtsinformationen
- Kostenfreier Zugang
- Reduzierung von KI-Halluzinationen durch strukturierte Daten

---

## 4. Roadmap und nächste Schritte

### Phase 1: Foundation (Monate 1-6)
- ✅ PoC erfolgreich (SGB III, BA-Weisungen, >85% Confidence)
- 🔄 Erweiterung auf SGB I, II, X (Kerngesetze Sozialrecht)
- 🔄 Community-Aufbau: GitHub-Repo öffentlich
- 🔄 Governance-Workshops mit Stakeholdern

### Phase 2: Expansion (Monate 7-12)
- 📋 Weitere SGB-Bücher (IV-XII)
- 📋 BGB, StGB (Zivil-/Strafrecht)
- 📋 Erstes Bundesland als Pilot
- 📋 Automatisierte Update-Pipeline
- 📋 REST-API, SPARQL-Endpoint

### Phase 3: Professionalisierung (Jahr 2)
- 📋 Alle Bundesgesetze (~2.000)
- 📋 3-5 Bundesländer
- 📋 ML-Modelle für automatische Extraktion
- 📋 Nachhaltige Governance etabliert

### Phase 4: Nachhaltigkeit (ab Jahr 3)
- 📋 Vollständige Abdeckung Bund + Länder
- 📋 Historische Versionen
- 📋 EU-Recht-Integration
- 📋 Self-sustaining Community

---

## 5. Herausforderungen und Lösungsansätze

### 5.1 Urheberrecht und Datenbankrechte

**Problem**: Sind Gesetzestexte gemeinfrei? (§ 5 UrhG: amtliche Werke ja, aber Konsolidierungen?)

**Lösung**:
- Fokus auf Strukturdaten und Metadaten (unstreitig nicht urheberrechtlich geschützt)
- Verweise auf offizielle Quellen statt Volltext-Hosting
- Kooperation mit BMJV für Datenlizenzierung

### 5.2 Konkurrenz zu kommerziellen Anbietern

**Problem**: Widerstand von juris, beck-online?

**Lösung**:
- Komplementäres Angebot (strukturierte Verweise vs. Kommentierung/Rechtsprechung)
- APIs könnten auch von kommerziellen Anbietern genutzt werden (Win-Win)

### 5.3 Technische Komplexität

**Problem**: Normalisierung ist schwer (Edge-Cases, Kontextabhängigkeit)

**Lösung**:
- Transparente Confidence-Scores
- Kontinuierliche Verbesserung durch Community-Feedback
- Klare Dokumentation von Grenzen

---

## 6. Call to Action

**Für Entscheider:innen in Justiz und Verwaltung:**
- Workshop mit Stakeholdern aus Bund/Ländern (Q1 2025)
- Machbarkeitsstudie für öffentliche Finanzierung
- Pilotprojekt mit 1-2 Bundesländern

**Für Legal-Tech-Entwickler:innen:**
- GitHub-Repo öffentlich machen (mit PoC-Code)
- Developer Preview auf Hugging Face
- Community-Call: Feedback zu APIs

**Für Wissenschaftler:innen:**
- Workshop auf Rechtsinformatik-Konferenz (IRIS, Jurix)
- Forschungsanträge für Erweiterungen (DFG, EU)

---

## Fazit

Die Normalisierung von Rechtsverweisen ist eine Herausforderung, die **alle** im deutschen Rechtsraum betrifft. Unser Proof-of-Concept hat gezeigt, dass eine Lösung technisch machbar ist.

**Aber**: Das Problem ist zu groß für Einzellösungen. Nur durch ein **gemeinschaftliches, offenes Datenprodukt** können wir:
- Doppelarbeit vermeiden
- Interoperabilität sicherstellen
- Qualität durch gemeinsame Standards gewährleisten
- Rechtssicherheit und Effizienz für alle erhöhen

**Wir laden Sie ein, Teil dieser Initiative zu werden.**

Gemeinsam können wir die Grundlage schaffen, von der Gerichte, Verwaltungen, Anwaltskanzleien, Legal-Tech-Unternehmen, Wissenschaft und letztlich alle Bürger:innen profitieren.

---

**Kontakt**: [legal-refs@senticor.de](mailto:legal-refs@senticor.de)

*Dieses Papier basiert auf dem Senticor RuleGraph Proof-of-Concept (Stand: November 2025). Technische Details und Code werden nach Freigabe auf GitHub veröffentlicht.*
