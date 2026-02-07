import { createCanonicalId } from "./canonical-id";
import type {
  InboxItem,
  Action,
  Project,
  ReferenceMaterial,
  Provenance,
  CaptureSource,
  GtdContext,
  Port,
  TypedReference,
} from "./gtd-types";

let counter = 0;

function nextId(): string {
  counter++;
  return `test-${counter.toString().padStart(8, "0")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultProvenance(): Provenance {
  const now = nowIso();
  return {
    createdAt: now,
    updatedAt: now,
    history: [{ timestamp: now, action: "created" }],
  };
}

function defaultSource(): CaptureSource {
  return { kind: "thought" };
}

// ---------------------------------------------------------------------------
// Inbox Item Factory
// ---------------------------------------------------------------------------

export function createInboxItem(
  overrides: Partial<InboxItem> & { title: string },
): InboxItem {
  const id = overrides.id ?? createCanonicalId("inbox", nextId());
  return {
    id,
    bucket: "inbox",
    title: overrides.title,
    rawCapture: overrides.rawCapture ?? overrides.title,
    notes: overrides.notes,
    tags: overrides.tags ?? [],
    references: overrides.references ?? [],
    captureSource: overrides.captureSource ?? defaultSource(),
    provenance: overrides.provenance ?? defaultProvenance(),
    ports: overrides.ports ?? [],
    needsEnrichment: overrides.needsEnrichment ?? true,
    confidence: overrides.confidence ?? "low",
  };
}

// ---------------------------------------------------------------------------
// Action Factory
// ---------------------------------------------------------------------------

export function createAction(
  overrides: Partial<Action> & { title: string },
): Action {
  const id = overrides.id ?? createCanonicalId("action", nextId());
  return {
    id,
    bucket: overrides.bucket ?? "next",
    title: overrides.title,
    notes: overrides.notes,
    tags: overrides.tags ?? [],
    references: overrides.references ?? [],
    contexts: overrides.contexts ?? [],
    captureSource: overrides.captureSource ?? defaultSource(),
    provenance: overrides.provenance ?? defaultProvenance(),
    ports: overrides.ports ?? [],
    needsEnrichment: overrides.needsEnrichment ?? false,
    confidence: overrides.confidence ?? "high",
    isFocused: overrides.isFocused ?? false,
    projectId: overrides.projectId,
    delegatedTo: overrides.delegatedTo,
    scheduledDate: overrides.scheduledDate,
    scheduledTime: overrides.scheduledTime,
    dueDate: overrides.dueDate,
    startDate: overrides.startDate,
    recurrence: overrides.recurrence,
    completedAt: overrides.completedAt,
    sequenceOrder: overrides.sequenceOrder,
  };
}

// ---------------------------------------------------------------------------
// Project Factory
// ---------------------------------------------------------------------------

export function createProject(
  overrides: Partial<Project> & { title: string; desiredOutcome: string },
): Project {
  const id = overrides.id ?? createCanonicalId("project", nextId());
  return {
    id,
    bucket: "project",
    title: overrides.title,
    desiredOutcome: overrides.desiredOutcome,
    status: overrides.status ?? "active",
    actionIds: overrides.actionIds ?? [],
    notes: overrides.notes,
    tags: overrides.tags ?? [],
    references: overrides.references ?? [],
    captureSource: overrides.captureSource ?? defaultSource(),
    provenance: overrides.provenance ?? defaultProvenance(),
    ports: overrides.ports ?? [],
    needsEnrichment: overrides.needsEnrichment ?? false,
    confidence: overrides.confidence ?? "high",
    isFocused: overrides.isFocused ?? false,
    reviewDate: overrides.reviewDate,
    completedAt: overrides.completedAt,
  };
}

// ---------------------------------------------------------------------------
// Reference Material Factory
// ---------------------------------------------------------------------------

export function createReferenceMaterial(
  overrides: Partial<ReferenceMaterial> & { title: string },
): ReferenceMaterial {
  const id = overrides.id ?? createCanonicalId("reference", nextId());
  return {
    id,
    bucket: "reference",
    title: overrides.title,
    notes: overrides.notes,
    tags: overrides.tags ?? [],
    references: overrides.references ?? [],
    captureSource: overrides.captureSource ?? defaultSource(),
    provenance: overrides.provenance ?? defaultProvenance(),
    ports: overrides.ports ?? [],
    needsEnrichment: overrides.needsEnrichment ?? false,
    confidence: overrides.confidence ?? "medium",
    contentType: overrides.contentType,
    externalUrl: overrides.externalUrl,
    origin: overrides.origin ?? "captured",
  };
}

// ---------------------------------------------------------------------------
// Context Factory
// ---------------------------------------------------------------------------

export function createContext(
  overrides: Partial<GtdContext> & { name: string },
): GtdContext {
  const id = overrides.id ?? createCanonicalId("context", nextId());
  return {
    id,
    name: overrides.name,
    icon: overrides.icon,
    color: overrides.color,
  };
}

// ---------------------------------------------------------------------------
// Helper: typed reference
// ---------------------------------------------------------------------------

export function createTypedReference(
  overrides: Partial<TypedReference> &
    Pick<TypedReference, "type" | "targetId">,
): TypedReference {
  return {
    type: overrides.type,
    targetId: overrides.targetId,
    note: overrides.note,
    createdAt: overrides.createdAt ?? nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Helper: port factories
// ---------------------------------------------------------------------------

export function definitionPort(doneCriteria: string): Port {
  return { kind: "definition", doneCriteria };
}

export function predicatePort(conditions: string[]): Port {
  return { kind: "predicate", conditions };
}

export function computationPort(
  opts?: Pick<
    Extract<Port, { kind: "computation" }>,
    "timeEstimate" | "energyLevel"
  >,
): Port {
  return { kind: "computation", ...opts };
}

export function procedurePort(
  steps: Array<{ text: string; completed?: boolean }>,
): Port {
  return {
    kind: "procedure",
    steps: steps.map((s, i) => ({
      id: `step-${i}`,
      text: s.text,
      completed: s.completed ?? false,
    })),
  };
}

/** Reset the internal counter (for test isolation). */
export function resetFactoryCounter(): void {
  counter = 0;
}
