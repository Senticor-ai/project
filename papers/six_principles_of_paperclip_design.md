# The Principles of Paperclip Design (Expanded Checklist)

Paperclip design is not a visual trend. It is a **workspace philosophy** for complex, knowledge-heavy, AI-assisted systems (government, legal, research, ops). This document combines:
- time-tested UX principles
- modern paperclip-punk aesthetics
- concrete checklists for design & engineering teams

Use it as a **design review checklist**, not as inspiration fluff.

---

## 1. Everything Is an Object (Object-Oriented UX)

**Foundations**
- Rooted in: object-oriented design, direct manipulation (Shneiderman), desktop metaphors

**Principle**
Every meaningful thing must exist as a first-class, addressable object.

**Checklist**
- ☐ Emails are objects (not rows)
- ☐ Documents are objects (not files hidden behind buttons)
- ☐ Notes are objects (with lifecycle and provenance)
- ☐ AI outputs are objects (never inline magic text)
- ☐ Procedures / rules are objects (attachable, detachable)

**UX Signals**
- Visible boundaries (cards, sheets)
- Stable identity (title, type, timestamp)
- Can exist before being “placed” anywhere

> If users can talk about it, it must be an object.

---

## 2. Relationships Over Navigation (Context by Attachment)

**Foundations**
- Rooted in: information architecture, graph thinking, sense-making systems

**Principle**
Meaning is created by *relationships*, not by moving between pages.

**Checklist**
- ☐ Users attach objects instead of navigating to screens
- ☐ Relationships are always visible
- ☐ Objects can have multiple parents
- ☐ Detaching is as easy as attaching

**UX Signals**
- Clip / attachment chips
- “Attached to …” sections
- No hidden system state

> The UI answers “What is connected?” instead of “Where am I?”

---

## 3. Gravity Creates Focus (Progressive Commitment)

**Foundations**
- Rooted in: progressive disclosure, cognitive load theory

**Principle**
Focus is created by *attraction*, not by hiding or locking UI.

**Checklist**
- ☐ Inbox shows loose, uncommitted objects
- ☐ Case clusters objects without removing them
- ☐ Procedure applies constraints without changing layout
- ☐ Switching focus never destroys context

**UX Signals**
- Sticky headers
- Highlighted clusters
- Constraint badges

> Focus emerges by attraction, not by exclusion.

---

## 4. Reversibility Is Sacred (Safety by Design)

**Foundations**
- Rooted in: undo/redo, error-tolerant design

**Principle**
Users must never fear exploration.

**Checklist**
- ☐ Attachments are reversible
- ☐ Procedures can be removed
- ☐ AI suggestions can be discarded
- ☐ Drafts auto-save
- ☐ No destructive default actions

**UX Signals**
- “Detach” instead of “Delete”
- History / provenance available
- No irreversible primary buttons

> Power comes from safety, not control.

---

## 5. AI Is a Contributor, Not an Authority

**Foundations**
- Rooted in: human-in-the-loop systems, explainable AI

**Principle**
AI produces *artifacts*, never decisions.

**Checklist**
- ☐ AI outputs appear as separate objects
- ☐ AI suggestions require explicit attachment
- ☐ AI reasoning is inspectable
- ☐ Human actions are always distinguishable

**UX Signals**
- AI badges
- Preview cards
- “Accept / discard” affordances

> Trust is built by optionality.

---

## 6. Language Describes Relationships (Mental Model Alignment)

**Foundations**
- Rooted in: cognitive linguistics, usability heuristics

**Principle**
Words must reinforce object + relationship thinking.

**Checklist**
- ☐ “Attach” replaces “Save”
- ☐ “Detach” replaces “Remove”
- ☐ “Applies to” replaces “Belongs in”
- ☐ Nouns > verbs

**UX Signals**
- Relationship-first labels
- No generic CRUD language

> Language is interaction design.

---

## 7. Interface-Level Responsiveness (paperclip-punk)

**Foundations**
- Rooted in: feedback loops, exploratory data viz, developer tools

**Principle**
The interface teaches the system by responding immediately.

**Checklist**
- ☐ Hover reveals meaning
- ☐ Scroll animates structure
- ☐ Comparisons animate differences
- ☐ No static diagrams

**UX Signals**
- On-hover inspectors
- Animated diffs
- Live previews

> The interface explains itself by reacting.

---

## 8. Speed Over Ceremony (Low-Friction Understanding)

**Foundations**
- Rooted in: minimal viable cognition

**Principle**
Understanding should be faster than reading.

**Checklist**
- ☐ Instant previews
- ☐ Inline comparisons
- ☐ No mandatory walkthroughs
- ☐ Zero-friction copy / attach

**UX Signals**
- Fast scrolling narratives
- Progressive reveal

> If it needs a tutorial, it is not paperclip-native.

---

## Canonical Paperclip Widgets (Required)

These widgets must exist to support paperclip UX:

### Object Card
- Represents one object
- Slight elevation
- Hover actions only

### Sheet / Side Panel
- Replaces modals
- Anchored to context
- Auto-saving

### Clip / Attachment Chip
- Shows relationship
- Removable
- Stackable

### Hover Inspector
- Infinite depth
- Explains rules, provenance, AI reasoning

### Comparison Panel
- Before / after
- Rule impact
- AI vs human

### Live Graph / Diagram
- Object graph
- Procedure constraints
- Dependency visualization

---

## Styling Checklist (paperclip-punk compatible)

- ☐ Light background
- ☐ Paper-like neutral surfaces
- ☐ Blueprint accent colors (industrial blue / orange)
- ☐ Neutral grotesk or mono fonts (Inter, Söhne, JetBrains Mono)
- ☐ Subtle motion (lift, snap, unfold)
- ☐ No decorative gradients

> Visuals exist to reveal structure, not to impress.

---

## Final Litmus Test

A system is paperclip-native if:
- users can explain how it works without training
- AI never surprises them
- nothing feels irreversible
- meaning emerges through interaction

---

## One-Line Summary

Paperclip design creates fast, reversible, object-centric workspaces where meaning is built through visible relationships and responsive interfaces — not screens, forms, or automation magic.