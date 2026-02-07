# Evidence-First FRBR Architecture

> **Status**: This document describes a proposed architecture. See [Implementation Status](#implementation-status) below for what has been implemented vs. what remains as future work.

## Principle
**Always create complete FRBR hierarchy. Use "unknown" placeholders when information isn't in the source. Let enrichment fill gaps later.**

## Current Problem (When This Was Written)
We're creating nodes conditionally and hardcoding information:
- Deutschland node only if German docs exist
- BA node only if BA docs exist
- Hardcoded names, URLs, relationships

This creates inconsistency and makes assumptions.

---

## Implementation Status

### ✅ **IMPLEMENTED: Core FRBR Hierarchy**

The system successfully creates a complete FRBR hierarchy for all documents:

**Current Implementation** ([frbr-builder.mjs](../scripts/langgraph/extraction/agents/frbr-builder.mjs)):
- ✅ **Work**: Abstract legal concept (e.g., `urn:de:frbr:work:ba:weisung`)
- ✅ **Expression**: Specific version (e.g., `urn:de:frbr:expression:ba:weisung:current`)
- ✅ **Manifestation**: One per section for granular provenance (e.g., `urn:de:frbr:manifestation:ba:weisung:202511001:text/markdown:bundesagentur`)
- ✅ **Item**: File instance (e.g., `urn:de:frbr:item:ba:weisung:weisung-202511001_ba054998`)

**Correct Relationships**:
- ✅ Expression → `frbr:realizationOf` → Work
- ✅ Manifestation → `frbr:embodimentOf` → Expression
- ✅ Integration with LegalRuleML (`lrml:LegalSource` nodes)

**Evidence**: See [latest knowledge graph](../../data/runs/latest/graphs/knowledge-graph.jsonld) - all documents have complete FRBR hierarchy.

### ⚠️ **ISSUES: Minor FRBR Compliance Problems**

**1. Item Links to Wrong Level**:
```json
// CURRENT (incorrect):
{ "@type": "frbr:Item", "frbr:exemplarOf": { "@id": "urn:de:frbr:expression:..." } }

// SHOULD BE:
{ "@type": "frbr:Item", "frbr:exemplarOf": { "@id": "urn:de:frbr:manifestation:..." } }
```
**Impact**: Item should exemplify a Manifestation, not an Expression (per FRBR spec).

**2. LegalSource Links to Expression Instead of Manifestation**:
```json
// CURRENT:
{ "@type": "lrml:LegalSource", "frbr:embodiment": { "@id": "urn:de:frbr:expression:..." } }

// SHOULD BE:
{ "@type": "lrml:LegalSource", "frbr:embodiment": { "@id": "urn:de:frbr:manifestation:..." } }
```
**Impact**: Each section should link to its specific Manifestation for proper provenance tracking.

**3. Missing Reverse Link**:
- Manifestation should link back to Item
- Currently only Item → Expression exists

### ❌ **NOT IMPLEMENTED: Evidence-First Pattern**

The following proposed architecture has **NOT** been implemented:

**1. Three-Phase Processing** (proposed below, not in code):
- Phase 1: Document Classification (heuristic detection)
- Phase 2: FRBR Hierarchy with placeholders
- Phase 3: LLM enrichment for unknowns

**2. "Unknown" Placeholder Nodes** (not implemented):
```javascript
// PROPOSED (not in code):
{
  "@id": "urn:unknown:jurisdiction",
  "@type": "lrml:Jurisdiction",
  "schema:name": "Unknown Jurisdiction",
  "lc:needsEnrichment": true  // ← Flag not used in current implementation
}
```

**3. Always-Create Pattern** (not implemented):
- Current code still uses conditional node creation
- Jurisdiction/organization nodes only created if detected
- No `lc:needsEnrichment` flag for unknowns

**4. LLM Enrichment for Metadata** (not implemented):
- No LLM-based enrichment of unknown jurisdiction/publisher
- All metadata comes from heuristic detection only

### 📋 **Summary Table**

| Feature | Status | Notes |
|---------|--------|-------|
| **Complete FRBR Hierarchy** | ✅ Implemented | Work → Expression → Manifestation → Item |
| **Granular Manifestations** | ✅ Implemented | One per section (correct) |
| **FRBR Relationships** | ⚠️ Mostly Correct | Item links need fix |
| **Three-Phase Processing** | ❌ Not Implemented | Still using simple heuristics |
| **Unknown Placeholders** | ❌ Not Implemented | No `lc:needsEnrichment` pattern |
| **Always-Create Pattern** | ❌ Not Implemented | Still conditional logic |
| **LLM Metadata Enrichment** | ❌ Not Implemented | Only heuristic detection |

---

## Proposed Architecture (Future Work)

The sections below describe the **proposed** evidence-first pattern that has not been implemented yet.

## Proposed Solution: Three-Phase Processing

### Phase 1: Document Classification (NO LLM)
**Input**: Raw markdown file
**Output**: Document type, detected metadata
**Location**: `structure-parser.mjs`

```javascript
function classifyDocument(filePath, content) {
  return {
    language: detectLanguage(content),        // "de" or "unknown"
    documentType: detectDocumentType(content), // "weisung", "ba-document", "statute", "article", "unknown"
    publisher: detectPublisher(filePath),      // "bundesagentur", "gesetze-im-internet", "unknown"
    jurisdiction: detectJurisdiction(content), // "de:jurisdiction", "unknown"
    documentId: extractDocumentId(filePath)    // From filename
  };
}
```

**Detection logic** (heuristic, no LLM):
- Language: Check for German words, umlauts
- Document type: Filename patterns, content markers
- Publisher: Filename patterns (weisung-*, dok_ba*, BJNR*)
- Jurisdiction: Language + publisher hints

### Phase 2: FRBR Hierarchy Creation (NO LLM)
**Input**: Classified document + sections
**Output**: Complete FRBR hierarchy with placeholders
**Location**: `frbr-builder.mjs`

```javascript
function buildCompleteHierarchy(classification, sections) {
  // ALWAYS create jurisdiction node (even if unknown)
  const jurisdiction = {
    "@id": classification.jurisdiction || "urn:unknown:jurisdiction",
    "@type": "lrml:Jurisdiction",
    "schema:name": classification.jurisdiction === "de:jurisdiction" ? "Germany" : "Unknown Jurisdiction",
    "lc:needsEnrichment": classification.jurisdiction === "unknown"
  };
  
  // ALWAYS create organization node (even if unknown)
  const organization = {
    "@id": classification.publisher ? `urn:de:org:${classification.publisher}` : "urn:unknown:organization",
    "@type": "schema:Organization",
    "schema:name": getOrganizationName(classification.publisher) || "Unknown Organization",
    "schema:parentOrganization": { "@id": jurisdiction["@id"] },
    "lc:needsEnrichment": !classification.publisher
  };
  
  // ALWAYS create Work
  const work = {
    "@id": `urn:de:frbr:work:${classification.documentId}`,
    "@type": "frbr:Work",
    "schema:publisher": { "@id": organization["@id"] },
    "lrml:hasJurisdiction": { "@id": jurisdiction["@id"] }
  };
  
  // ALWAYS create Expression, Manifestations, Item
  // ... (as before)
  
  return {
    jurisdiction,
    organization,
    work,
    expression,
    manifestations,
    item
  };
}
```

### Phase 3: Enrichment (OPTIONAL LLM)
**Input**: Graph with placeholders
**Output**: Enriched graph with unknowns filled
**Location**: `semantic-enricher.mjs` (new capability)

```javascript
async function enrichUnknownNodes(graph) {
  const unknownNodes = graph.nodes.filter(n => n["lc:needsEnrichment"]);
  
  for (const node of unknownNodes) {
    if (node["@type"] === "lrml:Jurisdiction") {
      // LLM: Analyze document to determine jurisdiction
      const jurisdiction = await llm.identifyJurisdiction(node.evidence);
      node["schema:name"] = jurisdiction.name;
      node["@id"] = jurisdiction.urn;
      delete node["lc:needsEnrichment"];
    }
    
    if (node["@type"] === "schema:Organization") {
      // LLM: Analyze document to determine publisher
      const org = await llm.identifyPublisher(node.evidence);
      node["schema:name"] = org.name;
      node["schema:url"] = org.url;
      delete node["lc:needsEnrichment"];
    }
  }
  
  return graph;
}
```

## Benefits

### 1. Consistency
- ✅ ALWAYS complete FRBR hierarchy
- ✅ No conditional node creation
- ✅ Predictable graph structure

### 2. Transparency
- ✅ Clear what's detected vs unknown
- ✅ `lc:needsEnrichment` flag shows gaps
- ✅ No hidden assumptions

### 3. Flexibility
- ✅ Works without LLM (structure-only)
- ✅ LLM enrichment is optional
- ✅ Can enrich later/incrementally

### 4. Evidence-Based
- ✅ Text content is the evidence
- ✅ FRBR hierarchy organizes evidence
- ✅ Metadata derived from evidence

## Example: Unknown Document

### Input
```markdown
# Some Document
This is a document about something.
```

### Phase 1: Classification
```javascript
{
  language: "unknown",
  documentType: "article",
  publisher: "unknown",
  jurisdiction: "unknown",
  documentId: "some-document"
}
```

### Phase 2: FRBR Hierarchy
```json
{
  "jurisdiction": {
    "@id": "urn:unknown:jurisdiction",
    "@type": "lrml:Jurisdiction",
    "schema:name": "Unknown Jurisdiction",
    "lc:needsEnrichment": true
  },
  "organization": {
    "@id": "urn:unknown:organization",
    "@type": "schema:Organization",
    "schema:name": "Unknown Organization",
    "lc:needsEnrichment": true
  },
  "work": {
    "@id": "urn:de:frbr:work:some-document",
    "@type": "frbr:Work",
    "schema:publisher": {"@id": "urn:unknown:organization"}
  }
}
```

### Phase 3: Enrichment (Optional)
```json
{
  "jurisdiction": {
    "@id": "urn:de:jurisdiction",
    "@type": "lrml:Jurisdiction",
    "schema:name": "Germany"
  },
  "organization": {
    "@id": "urn:de:org:bundesagentur",
    "@type": "schema:Organization",
    "schema:name": "Bundesagentur für Arbeit"
  }
}
```

## Implementation Plan

### Step 1: Add Classification Function
**File**: `structure-parser.mjs`
```javascript
function classifyDocument(filePath, content) {
  // Detect language
  const hasGermanChars = /[äöüßÄÖÜ]/.test(content);
  const hasGermanWords = /\b(und|der|die|das|für|von|mit)\b/i.test(content);
  const language = (hasGermanChars || hasGermanWords) ? "de" : "unknown";
  
  // Detect document type
  let documentType = "article";
  if (filePath.includes("weisung")) documentType = "weisung";
  else if (filePath.includes("dok_ba")) documentType = "ba-document";
  else if (filePath.includes("BJNR")) documentType = "statute";
  else if (content.includes("Weisung")) documentType = "weisung";
  
  // Detect publisher
  let publisher = "unknown";
  if (filePath.includes("weisung") || filePath.includes("dok_ba") || filePath.includes("fw-sgb")) {
    publisher = "bundesagentur";
  } else if (filePath.includes("BJNR")) {
    publisher = "gesetze-im-internet";
  }
  
  // Detect jurisdiction
  const jurisdiction = (language === "de") ? "de:jurisdiction" : "unknown";
  
  return { language, documentType, publisher, jurisdiction };
}
```

### Step 2: Always Create Hierarchy Nodes
**File**: `frbr-builder.mjs`
```javascript
function buildJurisdictionNode(classification) {
  const isKnown = classification.jurisdiction !== "unknown";
  return {
    "@id": isKnown ? `urn:${classification.jurisdiction}` : "urn:unknown:jurisdiction",
    "@type": "lrml:Jurisdiction",
    "schema:name": isKnown ? getJurisdictionName(classification.jurisdiction) : "Unknown Jurisdiction",
    "lc:needsEnrichment": !isKnown
  };
}

function buildOrganizationNode(classification, jurisdictionId) {
  const isKnown = classification.publisher !== "unknown";
  return {
    "@id": isKnown ? `urn:de:org:${classification.publisher}` : "urn:unknown:organization",
    "@type": "schema:Organization",
    "schema:name": isKnown ? getOrganizationName(classification.publisher) : "Unknown Organization",
    "schema:parentOrganization": { "@id": jurisdictionId },
    "lc:needsEnrichment": !isKnown
  };
}
```

### Step 3: Remove Conditional Creation
**File**: `graph-assembler.mjs`
```javascript
// OLD: Conditional
if (hasGermanDocuments) {
  graphNodes.push(jurisdictionNode);
}

// NEW: Always create
const jurisdictionNode = buildJurisdictionNode(classification);
graphNodes.push(jurisdictionNode);
```

## Migration Path

1. **Phase 1**: Add classification function (non-breaking)
2. **Phase 2**: Change conditional to always-create (breaking change)
3. **Phase 3**: Add enrichment capability (optional feature)

## Questions to Resolve

1. **Unknown node IDs**: Use `urn:unknown:*` or something else?
2. **Enrichment trigger**: Manual flag or automatic?
3. **Confidence scores**: Add confidence to detected values?
4. **Multiple jurisdictions**: How to handle documents with multiple jurisdictions?

## Recommendation

Implement this architecture because:
- ✅ More principled (evidence-first)
- ✅ More transparent (explicit unknowns)
- ✅ More flexible (optional enrichment)
- ✅ FRBR compliant (always complete hierarchy)
- ✅ Cleaner code (no conditional node creation)
