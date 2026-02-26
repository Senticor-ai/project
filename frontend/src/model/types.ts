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
  | { kind: "import"; source: string }
  | { kind: "file"; fileName: string; mimeType: string }
  | { kind: "url"; url: string }
  | { kind: "copilot"; conversationId: string };

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

export interface NameProvenance {
  setBy: "user" | "ai" | "system";
  setAt: string;
  source: string;
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
  /** Backend file_id (UUID) — set after binary upload completes. */
  fileId?: string;
  /** Backend-provided download URL for the uploaded file. */
  downloadUrl?: string;
}

// ---------------------------------------------------------------------------
// ActionItem — unified type for inbox items and actions
// ---------------------------------------------------------------------------

export type ActionItemBucket =
  | "inbox"
  | "next"
  | "waiting"
  | "calendar"
  | "someday";

export interface ActionItem extends BaseEntity {
  bucket: ActionItemBucket;
  rawCapture?: string;
  nameProvenance?: NameProvenance;
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
  /** Full email body (HTML or plain text) — present only for EmailMessage items. */
  emailBody?: string;
  /** Link to open the original email in Gmail web. */
  emailSourceUrl?: string;
  /** schema.org object — canonical ID of the referenced item (generic; used by ReadAction, etc.). */
  objectRef?: CanonicalId;
  /** schema.org action subtype (e.g. "BuyAction", "PlanAction"). Absent = generic "Action". */
  schemaType?: string;
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
  tags: string[];
  energyLevel?: EnergyLevel;
  projectId?: CanonicalId;
  description?: string;
  orgRef?: OrgRef;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface OrgRef {
  id: string;
  name: string;
}

export interface Project extends BaseEntity {
  bucket: "project";
  desiredOutcome: string;
  status: "active" | "completed" | "on-hold" | "archived";
  dueDate?: string;
  reviewDate?: string;
  completedAt?: string;
  isFocused: boolean;
  orgRef?: OrgRef;
}

// ---------------------------------------------------------------------------
// Reference Material
// ---------------------------------------------------------------------------

export type ReferenceOrigin = "triaged" | "captured" | "file";

export interface ReferenceMaterial extends BaseEntity {
  bucket: "reference";
  projectIds: CanonicalId[];
  encodingFormat?: string;
  url?: string;
  origin?: ReferenceOrigin;
  orgRef?: OrgRef;
}

export type OrgDocType = "general" | "user" | "log" | "agent";
export type OrgRole =
  | "member"
  | "founder"
  | "accountant"
  | "advisor"
  | "interest";

export interface PersonItem extends BaseEntity {
  bucket: "reference";
  projectIds: CanonicalId[];
  email?: string;
  telephone?: string;
  jobTitle?: string;
  orgRef?: OrgRef;
  orgRole?: OrgRole | string;
}

export interface OrgDocItem extends ReferenceMaterial {
  orgDocType: OrgDocType;
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

export type AppItem =
  | ActionItem
  | Project
  | ReferenceMaterial
  | PersonItem
  | OrgDocItem
  | CalendarEntry;

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

export function isActionItem(item: AppItem): item is ActionItem {
  return ["inbox", "next", "waiting", "calendar", "someday"].includes(
    item.bucket,
  );
}

export function isInboxItem(item: AppItem): item is ActionItem {
  return item.bucket === "inbox";
}

export function isAction(item: AppItem): item is ActionItem {
  return ["next", "waiting", "calendar", "someday"].includes(item.bucket);
}

export function isProject(item: AppItem): item is Project {
  return item.bucket === "project";
}

export function isReferenceMaterial(item: AppItem): item is ReferenceMaterial {
  return item.bucket === "reference";
}

// ---------------------------------------------------------------------------
// URL Detection & Display
// ---------------------------------------------------------------------------

const URL_PATTERN = /^https?:\/\/\S+$/i;

export function isUrl(text: string): boolean {
  return URL_PATTERN.test(text.trim());
}

export function formatUrlForDisplay(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, "");
    const path =
      parsed.pathname.length > 1
        ? parsed.pathname.slice(0, 30) +
          (parsed.pathname.length > 30 ? "…" : "")
        : "";
    return `${host}${path}`;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Display Name Helper
// ---------------------------------------------------------------------------

export function getDisplayName(item: AppItem): string {
  const raw = item.name ?? ("rawCapture" in item ? item.rawCapture : undefined);
  if (!raw) return "Untitled";
  return isUrl(raw) ? formatUrlForDisplay(raw) : raw;
}
