import type { CanonicalId } from "./canonical-id";

// ---------------------------------------------------------------------------
// Confidence & Enrichment (from FRBR evidence-first paper)
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "high" | "medium" | "low";

/** Marks an entity as potentially needing further clarification. */
export interface Enrichable {
  needsEnrichment: boolean;
  confidence: ConfidenceLevel;
}

// ---------------------------------------------------------------------------
// Source Tracking (from LexCEL evidence anchors)
// ---------------------------------------------------------------------------

export type CaptureSource =
  | { kind: "thought" }
  | { kind: "email"; subject?: string; from?: string }
  | { kind: "meeting"; title?: string; date?: string }
  | { kind: "voice"; transcript?: string }
  | { kind: "import"; source: string };

// ---------------------------------------------------------------------------
// Provenance (append-only, no-delete policy)
// ---------------------------------------------------------------------------

export interface Provenance {
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  history: ProvenanceEntry[];
}

export type ProvenanceAction =
  | "created"
  | "clarified"
  | "moved"
  | "updated"
  | "archived"
  | "enriched"
  | "completed"
  | "focused"
  | "unfocused"
  | "renamed";

export interface ProvenanceEntry {
  timestamp: string;
  action: ProvenanceAction;
  from?: string;
  to?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

export interface WorkContext {
  id: CanonicalId;
  name: string;
  icon?: string;
  color?: string;
}

// ---------------------------------------------------------------------------
// Energy & Time Estimates (from LexCEL ComputationPort)
// ---------------------------------------------------------------------------

export type EnergyLevel = "low" | "medium" | "high";

export type TimeEstimate =
  | "5min"
  | "15min"
  | "30min"
  | "1hr"
  | "2hr"
  | "half-day"
  | "full-day";

// ---------------------------------------------------------------------------
// Typed References (from LexCEL typed renvoi)
// ---------------------------------------------------------------------------

export type ReferenceType =
  | "blocks"
  | "depends_on"
  | "delegates_to"
  | "refers_to"
  | "context_of"
  | "part_of"
  | "follows"
  | "waiting_on";

export interface TypedReference {
  type: ReferenceType;
  targetId: CanonicalId;
  note?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Recurrence (from NirvanaHQ)
// ---------------------------------------------------------------------------

export type RecurrencePattern =
  | { kind: "daily"; interval: number }
  | { kind: "weekly"; interval: number; daysOfWeek: number[] }
  | { kind: "monthly"; interval: number; dayOfMonth: number }
  | { kind: "yearly"; interval: number; month: number; day: number }
  | {
      kind: "after_completion";
      interval: number;
      unit: "days" | "weeks" | "months";
    };

// ---------------------------------------------------------------------------
// Ports (from LexCEL)
// ---------------------------------------------------------------------------

/** What does "done" mean for this action? */
export interface DefinitionPort {
  kind: "definition";
  doneCriteria: string;
}

/** Conditions that must be true to start. */
export interface PredicatePort {
  kind: "predicate";
  conditions: string[];
}

/** Effort / time / energy estimates. */
export interface ComputationPort {
  kind: "computation";
  timeEstimate?: TimeEstimate;
  energyLevel?: EnergyLevel;
}

/** Checklist / sub-steps. */
export interface ProcedurePort {
  kind: "procedure";
  steps: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string;
}

export type Port =
  | DefinitionPort
  | PredicatePort
  | ComputationPort
  | ProcedurePort;

// ---------------------------------------------------------------------------
// FRBR Hierarchy Level
// ---------------------------------------------------------------------------

export type FrbrLevel = "work" | "expression" | "manifestation" | "item";

// ---------------------------------------------------------------------------
// Base Entity
// ---------------------------------------------------------------------------

export interface BaseEntity extends Enrichable {
  id: CanonicalId;
  name?: string;
  description?: string;
  tags: string[];
  references: TypedReference[];
  captureSource: CaptureSource;
  provenance: Provenance;
  ports: Port[];
}

// ---------------------------------------------------------------------------
// Thing — unified type for inbox items and actions
// ---------------------------------------------------------------------------

export type ThingBucket = "inbox" | "next" | "waiting" | "calendar" | "someday";

export interface Thing extends BaseEntity {
  bucket: ThingBucket;
  rawCapture?: string;
  contexts: CanonicalId[];
  projectIds: CanonicalId[];
  delegatedTo?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  dueDate?: string;
  startDate?: string;
  isFocused: boolean;
  recurrence?: RecurrencePattern;
  completedAt?: string;
  sequenceOrder?: number;
}

// ---------------------------------------------------------------------------
// Triage Result (Inline inbox triage — replaces the multi-step dialog)
// ---------------------------------------------------------------------------

export type TriageBucket =
  | "next"
  | "waiting"
  | "calendar"
  | "someday"
  | "reference";

export interface TriageResult {
  targetBucket: TriageBucket | "archive";
  projectId?: CanonicalId;
  date?: string;
  contexts?: string[];
  energyLevel?: EnergyLevel;
  note?: string;
}

export interface ItemEditableFields {
  dueDate?: string;
  scheduledDate?: string;
  contexts: string[];
  energyLevel?: EnergyLevel;
  projectId?: CanonicalId;
  description?: string;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface Project extends BaseEntity {
  bucket: "project";
  desiredOutcome: string;
  status: "active" | "completed" | "on-hold" | "archived";
  reviewDate?: string;
  completedAt?: string;
  isFocused: boolean;
}

// ---------------------------------------------------------------------------
// Reference Material
// ---------------------------------------------------------------------------

export type ReferenceOrigin = "triaged" | "captured" | "file";

export interface ReferenceMaterial extends BaseEntity {
  bucket: "reference";
  encodingFormat?: string;
  url?: string;
  origin?: ReferenceOrigin;
}

// ---------------------------------------------------------------------------
// Calendar Entry
// ---------------------------------------------------------------------------

export interface CalendarEntry extends BaseEntity {
  bucket: "calendar";
  date: string;
  time?: string;
  duration?: number;
  isAllDay: boolean;
  recurrence?: RecurrencePattern;
}

// ---------------------------------------------------------------------------
// Union Types
// ---------------------------------------------------------------------------

export type AppItem = Thing | Project | ReferenceMaterial | CalendarEntry;

export type Bucket =
  | "inbox"
  | "next"
  | "project"
  | "waiting"
  | "calendar"
  | "someday"
  | "reference"
  | "focus";

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

export function isThing(item: AppItem): item is Thing {
  return ["inbox", "next", "waiting", "calendar", "someday"].includes(
    item.bucket,
  );
}

export function isInboxItem(item: AppItem): item is Thing {
  return item.bucket === "inbox";
}

export function isAction(item: AppItem): item is Thing {
  return ["next", "waiting", "calendar", "someday"].includes(item.bucket);
}

export function isProject(item: AppItem): item is Project {
  return item.bucket === "project";
}

export function isReferenceMaterial(item: AppItem): item is ReferenceMaterial {
  return item.bucket === "reference";
}

// ---------------------------------------------------------------------------
// Display Name Helper
// ---------------------------------------------------------------------------

export function getDisplayName(item: AppItem): string {
  if (item.name) return item.name;
  if ("rawCapture" in item && item.rawCapture) return item.rawCapture;
  return "Untitled";
}
