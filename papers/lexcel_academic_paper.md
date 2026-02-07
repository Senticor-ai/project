# LexCEL: A Hybrid Graph+Rule Architecture for Explainable LLM Reasoning over German Social Law

**Authors:** Anonymous for Review  
**Date:** November 9, 2025

---

## Abstract

Large Language Models (LLMs) are increasingly applied to legal tasks, but unconstrained generation and opaque reasoning limit their reliability in compliance and administration. We present **LexCEL**, a hybrid architecture that combines a document-centric legal knowledge graph with a compiled rule layer. The graph extends **Schema.org**, **ELI/LegalDocML (Akoma Ntoso)**, and **Web Annotation** to capture identity, versioning, and *typed renvoi* (cross-references) for German social law (*Sozialrecht*). On top, we define modular, executable `NormBlock`s and a small set of typed `Port`s (`DefinitionPort`, `PredicatePort`, `ComputationPort`, `ProcedurePort`) that allow laws (SGB modules) to compose with *Verwaltungsvorschriften* (VV) and *Weisungen* as overlays while preserving precedence (law > VV > Weisung). A compiler translates selected subgraphs into deterministic policy rules using **CEL** (optionally **OPA** for deployment) with **SHACL** validation, yielding auditable decisions with provenance-backed proofs. In a practical scenario spanning 4–10 SGB laws with 10 VV and 20 Weisungen, we outline a protocol and metrics for trace completeness, structural complexity ("goto-ness"), compilation success, and human review effort. Results indicate that graph+rule hybrids support evidence-first explanations and reduce ambiguity in administrative decision support without requiring monolithic theorem proving.

**Keywords:** Legal Knowledge Graph; German Social Law; Verwaltungsvorschriften; Weisungen; ELI; Akoma Ntoso; Schema.org; Web Annotation; Open Policy Agent; Common Expression Language; SHACL; Explainable AI; GraphRAG; N3.js; RDF/JS.

---

## 1. Introduction

German administrative decision-making relies on statutory law (e.g., SGB I/II/III/X), complemented by *Verwaltungsvorschriften* (VV) and *Weisungen* that interpret and operationalize statutes for agencies. Legal texts exhibit pervasive cross-references (*renvoi*), including dynamic references ("gilt entsprechend/sinngemäß") and exceptions ("abweichend von"). LLMs excel at semantic retrieval and drafting but struggle with deterministic, court-friendly reasoning and provenance.

We propose **LexCEL**, a hybrid design that treats the legal corpus as a modular program: laws as **modules**, VV/Weisungen as **overlays**, and interfaces to periphery as narrow, typed **ports**. A document-centric RDF graph provides identity, versioning, and evidence anchors; a rule layer compiled from the graph provides deterministic decisions and proof traces.

**Contributions**

1. A minimal, implementation-ready **LexCEL vocabulary** that extends Schema.org/ELI/LegalDocML with typed renvoi, executable *NormBlocks*, and modular ports.
2. A **layered composition model** for statutes, VV, and Weisungen that enforces precedence and prevents internal guidance from overriding statutory effects.
3. A **compiler** from graph substructures to executable policy (CEL; optional OPA for rollout) with **SHACL** validation, preserving provenance via Web Annotation selectors and content hashes.
4. An **evaluation protocol** for a 4–10 law scenario (Sozialrecht), including metrics for trace completeness, structural complexity, and human review effort.

---

## 2. Background

### 2.1. German Social Law

The Social Code (SGB) comprises statutes governing benefits, eligibility, procedures, and sanctions. Agency-internal *Verwaltungsvorschriften* (VV) and *Weisungen* interpret or operationalize these norms but cannot contradict statute. Conflicts are resolved via *lex specialis* and *lex posterior*; cross-references may be static or dynamic.

### 2.2. Challenges for LLMs

While retrieval-augmented generation (RAG) improves relevance, free-form reasoning is brittle, and explanations are rarely traceable to exact spans and versions. Administrative contexts require auditability, stable identity, and predictable application of exceptions.

---

## 3. Related Work

**Document ontologies.** ELI provides a European framework for identifying legal works, expressions, and versions. Akoma Ntoso (LegalDocML) captures legal document structure. Schema.org’s `Legislation` extends web-native metadata. The Web Annotation Data Model supports precise selectors for quoted evidence.

**Policy and constraints.** Open Policy Agent (OPA) offers a declarative policy runtime; Google’s Common Expression Language (CEL) enables embeddable expression evaluation; SHACL validates RDF graphs and shapes.

**Graph-based retrieval/reasoning.** GraphRAG approaches leverage typed edges for targeted retrieval and context assembly, improving faithfulness compared to bag-of-snippets RAG.

---

## 4. LexCEL: Data Model

We define a minimal vocabulary layered atop document ontologies. Core ideas: (i) **NormBlocks** as atomic, executable units (one effect with its conditions and exceptions); (ii) **typed renvoi** edges; (iii) **ports** for module interfaces; (iv) **overlays** for VV/Weisungen as named graphs.

### 4.1. Entities and Properties

- `lc:NormBlock` — executable unit with decision mode (`must|may|discretion`), conditions, exceptions, effect, procedure.
- `lc:Clause` — normalized clause with text and optional structured predicate (AST).
- `lc:Effect` — `grant|deny|compute|oblige|authorize|suspend` with optional outputs.
- `lc:refersTo` — typed renvoi with `lc:refType` (`defines, incorporates, appliesCorrespondingly, delegates, exceptionOf, modifies, interprets, implements, prevailsOver`) and `lc:renvoiMode` (`static|dynamic`).
- `lc:Port` — `DefinitionPort, PredicatePort, ComputationPort, ProcedurePort` with versioned signatures.
- **Provenance** — `prov:wasDerivedFrom` links to statute/VV expression IRIs; `oa:hasSelector` anchors quoted spans; content hashes ensure integrity.
- **Overlays** — VV/Weisungen in separate **named graphs** that reference statute blocks via `lc:interprets`/`lc:implements` and are constrained not to alter statutory `lc:Effect.kind`.

### 4.2. Typed Ports and Program Composition

Each law module exports a small set of ports:

- **DefinitionPort** (e.g., *Arbeitslosigkeit*) → enriches Tatbestand typing.
- **PredicatePort** (e.g., *has_sperrzeit*) → guards (IF/UNLESS).
- **ComputationPort** (e.g., *compute_travel_cost_cap*) → used in effects.
- **ProcedurePort** (e.g., *receipt_check*) → operational steps.

Consumers import ports with parameter maps and renvoi mode (static preferred for determinism). This yields a build-time **evaluation DAG** that respects precedence (law > VV > Weisung) and resolves cycles via adapter cut-points.

### 4.3. Typed Renvoi Edges (Taxonomy and Semantics)

We model cross-references as **typed renvoi edges** that encode *what the reference does*:

- `defines` — imports or aligns a legal definition (e.g., “im Sinne des §…”, “Begriff nach §…”); used to type and normalize conditions.
- `incorporates` — wholesale incorporation of a rule or fragment without adaptation.
- `appliesCorrespondingly` — parameterized reuse (e.g., “gilt entsprechend/sinngemäß”); requires an explicit **param_map** (role/field mapping).
- `delegates` — procedural or decisional delegation (e.g., “nach Maßgabe des §…”); consumes a sub-decision or value from the target.
- `exceptionOf` — exception/override (e.g., “abweichend von §…”, “sofern nicht §…”); compiled as UNLESS-guards around the local effect.
- `modifies` — amendment/patch to a specific fragment.
- `prevailsOver` — precedence relation (lex specialis/posterior) for conflict resolution in the evaluation DAG.
- `interprets` — VV/Weisung narrows discretion or clarifies meaning; must not change the statutory effect kind.
- `implements` — operationalization: procedures, thresholds, validations supplied by VV/Weisungen/VO.

Each renvoi also carries **qualifiers**: `renvoiMode ∈ {static, dynamic}` (freeze vs. track latest) and, when applicable, a `paramMap`. These types and qualifiers permit deterministic compilation and targeted retrieval.

### 4.4. Evidence Anchors

For every renvoi and clause, we attach **evidence anchors** so that explanations are verifiable:

- **Source anchoring:** the IRI of the legal expression plus a Web Annotation selector (TextQuote and/or TextPosition) pointing to the exact span that justifies the edge.
- **Integrity:** a content hash (e.g., SHA-256) over the canonicalized span.
- **Trace linkage:** the compiled CEL retains pointers to these anchors, enabling step-by-step proofs.

---

## 5. System Architecture

**Ingest** parses statutes/VV/Weisungen and creates expression-level IRIs (ELI/LegalDocML). **Extraction** uses an LLM to propose `NormBlock`s, clauses, typed renvoi, ports, and parameter mappings (JSON). **Validation** applies JSON Schema/SHACL. **Linking** resolves cross-references and materializes overlays in named graphs. **Compilation** emits **CEL** (optionally **OPA** for deployment) with **SHACL** validation. **Runtime** evaluates policy and records **proof traces**.

### 5.1. Compiler Sketch

Given a connected subgraph `G` rooted at a `lc:NormBlock`:

1. Inline **DefinitionPort**s into the block’s condition AST (retain provenance).
2. For each `appliesCorrespondingly`, obtain/verify an explicit **param_map**; expand as a parameterized call.
3. Wrap **exceptions** as UNLESS guards; add overlay thresholds/caps as **ComputationPort**s.
4. Linearize to an evaluation DAG; memoize imported predicates; cut cycles.
5. Emit **CEL**: `precond && unless => effect` with explicit evidence pointers to IRIs/selectors.

### 5.2. Deep Links and Clause-Level Evidence Anchors

We require stable URIs at multiple granularities (work/expression/version/fragment) using ELI/LegalDocML plus fragment identifiers for paragraphs/clauses. For every clause and renvoi edge we store:

- **Stable links** to documents and granular anchors (paragraph, sentence, token range).
- **Web Annotation selectors** (TextQuote/TextPosition/XPath/CFI) attached to the exact span.
- **Integrity hashes** (e.g., SHA-256) over canonicalized spans. These anchors enable reproducible citations and one-click navigation from proofs to source.

### 5.3. Status Updates and Periodic Reviews

To ensure longitudinal reliability we support scheduled and ad-hoc re-execution while preserving provenance:

- **Versioned builds:** every compilation is tagged with source graph versions, timestamps, and change sets; earlier executions remain accessible.
- **Change detection (drift):** when upstream texts or targets of renvoi change, recompute affected blocks and surface deltas in the proof trace.
- **History:** append-only logs of executions (inputs, outputs, evidence) permit audit and comparative analysis.
- **Reproducibility manifests:** capture model versions, prompts, SHACL shapes, and CEL code used for each run.

### 5.4. Configurable Human-in-the-Loop Workflows

We provide review queues rather than DMS-style check-in/out:

- **Low-confidence extraction:** clauses/renvoi typed below a threshold are routed to expert review.
- **Param-map approval:** every `appliesCorrespondingly` carries an explicit, reviewed parameter map.
- **Exception scrutiny:** new or modified `exceptionOf` edges trigger targeted review.
- **SHACL gating:** only blocks passing shapes and reviews are eligible for compilation.
- **Provenance stamps:** reviewer decisions are recorded and linked to affected clauses and renvoi edges.

---

## 6. Implementation

We adopt an academic, minimal stack: **Python** for pipelines and **LangGraph** agents in the extraction phase; an **RDF/JS** triple store (**N3.js**) for the reasoning graph; **CEL** as the executable expression layer; and **SHACL** for graph constraints and validation. No Neo4j is required; triples are stored and queried within N3.js (with serialization to Turtle/JSON-LD for persistence and exchange).

- **Extraction (Python + LangGraph):** segment statutes/VV/Weisungen into `NormBlock`s; classify typed renvoi; propose ports and parameter mappings; emit JSON-LD with provenance (Web Annotation selectors + content hashes); generate CEL strings for `precond`, `unless`, `effect`, including pointers to the IRIs used for each clause.
- **Graph layer (Node.js + N3.js):** maintain the statute corpus and overlays in **named graphs**; materialize typed renvoi edges (with `renvoiMode` and optional `paramMap`); export slices (subgraphs) for compilation.
- **Validation (SHACL):** enforce structural constraints (e.g., every `appliesCorrespondingly` carries a total `paramMap`; overlays cannot change `lc:Effect.kind`; ports are versioned and typed). Validation may be run via **pySHACL** (Python) or **rdf-validate-shacl** (Node).
- **Execution of CEL:** evaluate compiled CEL either in-process (JS implementation) or via a small `cel-go` sidecar; keep CEL the single source of executable truth (OPA/Rego optional for policy deployment).
- **Proof logging:** record a **proof trace** at runtime: which clauses and ports fired, their variable bindings, and the exact IRIs/selectors that justify each step.

---

## 7. Evaluation Protocol (Sozialrecht Scenario)

**Scope.** 4–10 SGB laws (e.g., SGB I, II, III, X), 10 VV, 20 Weisungen; three focal tasks: *Fahrkosten*, *Mobbing*-related support, and *Sperrfristen*.

**Datasets.** For each focal task, curate gold cases with inputs (person, appointment, costs, documents) and expected outcomes; include edge cases (exceptions, overlapping renvoi).

**Metrics.**

- **Trace Completeness (TC):** proportion of decision steps with linked evidence (IRIs + selectors).
- **Structural Goto-Ness (SGN):** composite of out-degree, renvoi depth, SCC size; lower is better.
- **Compilation Success Rate (CSR):** fraction of blocks compiling to CEL (optionally to OPA for deployment) without manual edits.
- **Factual Consistency (FC):** human-judged alignment of output with cited spans (Likert or binary).
- **Review Effort (RE):** minutes of human validation per block/overlay.

**Mathematical Formalization of Metrics**  

For reproducibility, each metric is defined as:

- **Trace Completeness (TC):**  
  `TC = |E_linked| / |E_total|`  
  where `E_linked` is the number of decision steps with linked evidence (IRIs + selectors) and `E_total` is the total number of decision steps.

- **Structural Goto‑Ness (SGN):**  
  `SGN = α * d_out + β * r_depth + γ * s_SCC`  
  where `d_out` is the mean out‑degree of the graph, `r_depth` the average renvoi depth, and `s_SCC` the size of the largest strongly connected component. Coefficients α, β, γ are empirically chosen normalization factors.

- **Compilation Success Rate (CSR):**  
  `CSR = |B_compiled| / |B_total|`  
  where `B_compiled` is the number of successfully compiled NormBlocks.

- **Factual Consistency (FC):**  
  `FC = (Σ f_i) / N`  
  where `f_i ∈ {0,1}` indicates whether the *i‑th* output statement aligns with cited spans.

- **Review Effort (RE):**  
  `RE = (Σ t_j) / B_reviewed`  
  where `t_j` is human validation time (minutes) per block.

These definitions can be validated using random sampling and inter‑annotator agreement to ensure metric reliability.

**Baselines.** (i) RAG-only LLM (no executable rules); (ii) hand-crafted policy without graph provenance. Compare TC, FC, and error profiles.

---

## 8. Case Studies

### 8.1 Fahrkosten (Travel Cost Reimbursement)

Statute block requires mandatory appointment participation and actual necessary expenses; exception when third party covers costs. A VV overlay defines caps; a Weisung adds receipt-check procedure. Compiled rule: *IF mandatory appointment AND costs > 0 UNLESS third-party-covered THEN grant min(cost, cap)* with linked citations.

### 8.2 Mobbing-related Support

Cross-cuts benefit eligibility and counseling provisions; imports definitions of workplace harassment (where applicable) and procedure ports for documentation/verification. Overlays restrict discretion, requiring specific evidence patterns; trace shows each imported port and justification.

### 8.3 Sperrfristen (Suspension Periods)

Modeled as guards that suspend otherwise-granted benefits for *t* days, with documented exceptions (hardship). Predicate port `has_suspension(person, cause)` feeds into UNLESS clause; timers and notices emitted via procedure ports.

---

## 9. Ethics, Governance, and Compliance

We emphasize verifiable evidence, transparent precedence, and deterministic execution. Provenance (IRIs, selectors, hashes) and write-once/append-only logs support forensic audit. Personal data processing follows DS-GVO (GDPR) and BDSG principles (data minimization, purpose limitation). Human-in-the-loop review remains mandatory for low-confidence extractions and policy changes.

---

## 10. Limitations

Ambiguity in *entsprechend/sinngemäß* requires human parameter mapping. Dynamic renvoi introduces drift; we mitigate via static imports by default and automated drift checks. VV/Weisungen vary in quality and may duplicate content. Our metrics do not fully capture fairness or downstream social impact; broader evaluation is future work.

---

## 11. Conclusion

**LexCEL** demonstrates that a document-first legal graph, enriched with typed renvoi and compiled into executable rules, enables explainable, provenance-backed LLM reasoning for German social law. Future work includes richer conflict reasoning, integration of case law, automated test generation from overlays, and formal verification of rule properties.

---

## Appendix A — LexCEL Turtle Sketch (Conceptual)

*(sketch only; identifiers illustrative)*

```turtle
@prefix schema: <https://schema.org/> .
@prefix eli:    <http://data.europa.eu/eli/ontology#> .
@

@prefix lc:     <https://kg.example.org/lexcel#> .
@prefix prov:   <http://www.w3.org/ns/prov#> .
@prefix oa:     <http://www.w3.org/ns/oa#> .

<#sgb3_44_expr> a schema:Legislation ;
  schema:identifier "§ 44 SGB III" ;
  eli:version_date "2025-01-01" ;
  lc:hasBlock <#b1> .

<#b1> a lc:NormBlock ;
  lc:decisionMode lc:must ;
  lc:hasCondition <#c1>, <#c2> ;
  lc:hasException <#e1> ;
  lc:hasEffect <#eff1> ;
  lc:refersTo [ lc:refType lc:appliesCorrespondingly ;
                lc:renvoiMode lc:static ;
                lc:target <#sgb1_def_Arbeitslosigkeit> ] .
```

---

## Appendix B — JSON-LD Context (Excerpt)

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "eli": "http://data.europa.eu/eli/ontology#",
    "lc": "https://kg.example.org/lexcel#",
    "prov": "http://www.w3.org/ns/prov#",
    "oa": "http://www.w3.org/ns/oa#",
    "NormBlock": "lc:NormBlock",
    "Clause": "lc:Clause",
    "Effect": "lc:Effect",
    "refersTo": {"@id": "lc:refersTo", "@type": "@id"},
    "refType": {"@id": "lc:refType"},
    "renvoiMode": {"@id": "lc:renvoiMode"}
  }
}
```

---

## Appendix C — Example CEL Snippet (Conceptual)

```cel
precond: appointment.type in ['pflichtig'] && costs.travel_eur > 0
unless:  third_party_reimbursement == true
effect:  grant('fahrkosten', min(costs.travel_eur, POLICY_MAX))
```

---

## Appendix D — Program Manifest (Excerpt)

```json
{
  "id": "urn:program:de:sozialrecht-core@2025-11-09",
  "modules": [
    "urn:module:de:sgb3@2025-01-01",
    "urn:module:de:sgb2@2025-07-01",
    "urn:module:de:sgb1-adapter@2025-01-01",
    "urn:module:de:sgb3-vv@2025-02-15",
    "urn:module:de:sgb3-weisung@2025-03-01"
  ],
  "compile": ["cel"]
}
```

---

## References

- European Legislation Identifier (ELI) Ontology — [https://data.europa.eu/eli/ontology](https://data.europa.eu/eli/ontology)
- LegalDocML / Akoma Ntoso (OASIS) — [https://www.oasis-open.org/committees/legaldocml/](https://www.oasis-open.org/committees/legaldocml/)
- Schema.org: Legislation — [https://schema.org/Legislation](https://schema.org/Legislation)
- Web Annotation Data Model (W3C) — [https://www.w3.org/TR/annotation-model/](https://www.w3.org/TR/annotation-model/)
- Shapes Constraint Language (SHACL) — [https://www.w3.org/TR/shacl/](https://www.w3.org/TR/shacl/)
- Open Policy Agent (OPA) — [https://www.openpolicyagent.org/docs/](https://www.openpolicyagent.org/docs/)
- Common Expression Language (CEL) — [https://github.com/google/cel-spec](https://github.com/google/cel-spec)
- N3.js (RDF/JS) — [https://github.com/rdfjs/N3.js](https://github.com/rdfjs/N3.js)
- pySHACL — [https://github.com/RDFLib/pySHACL](https://github.com/RDFLib/pySHACL)
- rdf-validate-shacl — [https://github.com/zazuko/rdf-validate-shacl](https://github.com/zazuko/rdf-validate-shacl)
- Graph-based Retrieval-Augmented Generation (overview) — [https://arxiv.org/](https://arxiv.org/)

