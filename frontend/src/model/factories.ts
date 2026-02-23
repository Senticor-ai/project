import { createCanonicalId } from "./canonical-id";
import type { CanonicalId } from "./canonical-id";
import type {
  ActionItem,
  ActionItemBucket,
  Project,
  ReferenceMaterial,
  Provenance,
  CaptureSource,
  WorkContext,
  Port,
  TypedReference,
} from "./types";

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
// ActionItem Factory (unified)
// ---------------------------------------------------------------------------

/** Overrides for createActionItem — accepts `projectId` (convenience, wraps in array) or `projectIds`. */
type ActionItemOverrides = Partial<ActionItem> &
  ({ name: string } | { rawCapture: string }) & {
    /** Convenience: single project ID (wrapped into projectIds). */
    projectId?: CanonicalId;
  };

export function createActionItem(overrides: ActionItemOverrides): ActionItem {
  if (!overrides.name && !overrides.rawCapture) {
    throw new Error(
      "createActionItem requires at least one of {name, rawCapture}",
    );
  }
  const bucket: ActionItemBucket = overrides.bucket ?? "inbox";
  const entityType = bucket === "inbox" ? "inbox" : "action";
  const id = overrides.id ?? createCanonicalId(entityType, nextId());
  return {
    id,
    bucket,
    name: overrides.name,
    rawCapture: overrides.rawCapture,
    nameProvenance: overrides.nameProvenance,
    description: overrides.description,
    tags: overrides.tags ?? [],
    references: overrides.references ?? [],
    contexts: overrides.contexts ?? [],
    captureSource: overrides.captureSource ?? defaultSource(),
    provenance: overrides.provenance ?? defaultProvenance(),
    ports: overrides.ports ?? [],
    needsEnrichment: overrides.needsEnrichment ?? bucket === "inbox",
    confidence: overrides.confidence ?? (bucket === "inbox" ? "low" : "high"),
    isFocused: overrides.isFocused ?? false,
    projectIds:
      overrides.projectIds ??
      (overrides.projectId ? [overrides.projectId] : []),
    delegatedTo: overrides.delegatedTo,
    scheduledDate: overrides.scheduledDate,
    scheduledTime: overrides.scheduledTime,
    dueDate: overrides.dueDate,
    startDate: overrides.startDate,
    recurrence: overrides.recurrence,
    completedAt: overrides.completedAt,
    sequenceOrder: overrides.sequenceOrder,
    fileId: overrides.fileId,
    downloadUrl: overrides.downloadUrl,
    emailBody: overrides.emailBody,
    emailSourceUrl: overrides.emailSourceUrl,
    objectRef: overrides.objectRef,
  };
}

// ---------------------------------------------------------------------------
// Inbox Item Factory (convenience — delegates to createActionItem)
// ---------------------------------------------------------------------------

export function createInboxItem(overrides: ActionItemOverrides): ActionItem {
  const rawCapture = overrides.rawCapture ?? overrides.name;
  return createActionItem({
    ...overrides,
    bucket: "inbox",
    ...(rawCapture !== undefined && { rawCapture }),
    needsEnrichment: overrides.needsEnrichment ?? true,
    confidence: overrides.confidence ?? "medium",
  });
}

// ---------------------------------------------------------------------------
// Action Factory (convenience — delegates to createActionItem)
// ---------------------------------------------------------------------------

export function createAction(overrides: ActionItemOverrides): ActionItem {
  return createActionItem({
    ...overrides,
    bucket: overrides.bucket ?? "next",
    needsEnrichment: overrides.needsEnrichment ?? false,
    confidence: overrides.confidence ?? "high",
  });
}

// ---------------------------------------------------------------------------
// Project Factory
// ---------------------------------------------------------------------------

export function createProject(
  overrides: Partial<Project> & { name: string; desiredOutcome: string },
): Project {
  const id = overrides.id ?? createCanonicalId("project", nextId());
  return {
    id,
    bucket: "project",
    name: overrides.name,
    desiredOutcome: overrides.desiredOutcome,
    status: overrides.status ?? "active",
    description: overrides.description,
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
    orgRef: overrides.orgRef,
  };
}

// ---------------------------------------------------------------------------
// Reference Material Factory
// ---------------------------------------------------------------------------

/** Overrides for createReferenceMaterial — accepts `projectId` (convenience) or `projectIds`. */
type ReferenceMaterialOverrides = Partial<ReferenceMaterial> & {
  name: string;
} & {
  /** Convenience: single project ID (wrapped into projectIds). */
  projectId?: CanonicalId;
};

export function createReferenceMaterial(
  overrides: ReferenceMaterialOverrides,
): ReferenceMaterial {
  const id = overrides.id ?? createCanonicalId("reference", nextId());
  return {
    id,
    bucket: "reference",
    name: overrides.name,
    description: overrides.description,
    tags: overrides.tags ?? [],
    references: overrides.references ?? [],
    captureSource: overrides.captureSource ?? defaultSource(),
    provenance: overrides.provenance ?? defaultProvenance(),
    ports: overrides.ports ?? [],
    needsEnrichment: overrides.needsEnrichment ?? false,
    confidence: overrides.confidence ?? "medium",
    projectIds:
      overrides.projectIds ??
      (overrides.projectId ? [overrides.projectId] : []),
    encodingFormat: overrides.encodingFormat,
    url: overrides.url,
    origin: overrides.origin ?? "captured",
    fileId: overrides.fileId,
    downloadUrl: overrides.downloadUrl,
    orgRef: overrides.orgRef,
  };
}

// ---------------------------------------------------------------------------
// Context Factory
// ---------------------------------------------------------------------------

export function createContext(
  overrides: Partial<WorkContext> & { name: string },
): WorkContext {
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
