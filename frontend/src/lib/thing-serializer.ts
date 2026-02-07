import type { ThingRecord } from "./api-client";
import type {
  Thing,
  ThingBucket,
  Project,
  ReferenceMaterial,
  GtdItem,
  CaptureSource,
  Provenance,
  TypedReference,
  Port,
  TriageResult,
  ItemEditableFields,
} from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";
import { createCanonicalId } from "@/model/canonical-id";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = 1;

const TYPE_MAP = {
  inbox: "gtd:InboxItem",
  action: "gtd:Action",
  project: "gtd:Project",
  reference: "gtd:Reference",
} as const;

// ---------------------------------------------------------------------------
// toJsonLd — Frontend GTD entity → JSON-LD dict for the backend
// ---------------------------------------------------------------------------

function serializeThingFields(
  result: Record<string, unknown>,
  thing: Thing,
): void {
  result.contexts = thing.contexts;
  result.projectId = thing.projectId ?? null;
  result.delegatedTo = thing.delegatedTo ?? null;
  result.scheduledDate = thing.scheduledDate ?? null;
  result.scheduledTime = thing.scheduledTime ?? null;
  result.dueDate = thing.dueDate ?? null;
  result.startDate = thing.startDate ?? null;
  result.isFocused = thing.isFocused;
  result.recurrence = thing.recurrence ?? null;
  result.completedAt = thing.completedAt ?? null;
  result.sequenceOrder = thing.sequenceOrder ?? null;
}

export function toJsonLd(
  item: Thing | Project | ReferenceMaterial,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    "@id": item.id,
    _schemaVersion: SCHEMA_VERSION,
    title: item.title,
    bucket: item.bucket,
    notes: item.notes ?? null,
    tags: item.tags,
    references: item.references,
    captureSource: item.captureSource,
    provenance: item.provenance,
    ports: item.ports,
    needsEnrichment: item.needsEnrichment,
    confidence: item.confidence,
  };

  if (item.bucket === "inbox") {
    base["@type"] = TYPE_MAP.inbox;
    base.rawCapture = (item as Thing).rawCapture ?? (item as Thing).title;
    serializeThingFields(base, item as Thing);
  } else if (
    item.bucket === "next" ||
    item.bucket === "waiting" ||
    item.bucket === "calendar" ||
    item.bucket === "someday"
  ) {
    base["@type"] = TYPE_MAP.action;
    serializeThingFields(base, item as Thing);
  } else if (item.bucket === "project") {
    base["@type"] = TYPE_MAP.project;
    const project = item as Project;
    base.desiredOutcome = project.desiredOutcome;
    base.status = project.status;
    base.actionIds = project.actionIds;
    base.reviewDate = project.reviewDate ?? null;
    base.completedAt = project.completedAt ?? null;
    base.isFocused = project.isFocused;
  } else if (item.bucket === "reference") {
    base["@type"] = TYPE_MAP.reference;
    const ref = item as ReferenceMaterial;
    base.contentType = ref.contentType ?? null;
    base.externalUrl = ref.externalUrl ?? null;
    base.origin = ref.origin ?? null;
  }

  return base;
}

// ---------------------------------------------------------------------------
// fromJsonLd — ThingRecord from backend → Frontend GTD entity
// ---------------------------------------------------------------------------

export function fromJsonLd(record: ThingRecord): GtdItem {
  const t = record.thing;
  const type = t["@type"] as string;

  const base = {
    id:
      (t["@id"] as string as CanonicalId) ??
      (record.canonical_id as CanonicalId),
    title: t.title as string,
    notes: (t.notes as string) || undefined,
    tags: (t.tags as string[]) ?? [],
    references: (t.references as TypedReference[]) ?? [],
    captureSource: (t.captureSource as CaptureSource) ?? {
      kind: "thought" as const,
    },
    provenance: (t.provenance as Provenance) ?? {
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      history: [],
    },
    ports: (t.ports as Port[]) ?? [],
    needsEnrichment: (t.needsEnrichment as boolean) ?? true,
    confidence: (t.confidence as "high" | "medium" | "low") ?? "low",
  };

  const thingFields = {
    contexts: (t.contexts as CanonicalId[]) ?? [],
    projectId: (t.projectId as CanonicalId) || undefined,
    delegatedTo: (t.delegatedTo as string) || undefined,
    scheduledDate: (t.scheduledDate as string) || undefined,
    scheduledTime: (t.scheduledTime as string) || undefined,
    dueDate: (t.dueDate as string) || undefined,
    startDate: (t.startDate as string) || undefined,
    isFocused: (t.isFocused as boolean) ?? false,
    recurrence: t.recurrence as Thing["recurrence"],
    completedAt: (t.completedAt as string) || undefined,
    sequenceOrder: (t.sequenceOrder as number) || undefined,
  };

  if (type === TYPE_MAP.inbox) {
    return {
      ...base,
      ...thingFields,
      bucket: "inbox" as const,
      rawCapture: (t.rawCapture as string) ?? base.title,
    };
  }

  if (type === TYPE_MAP.action) {
    return {
      ...base,
      ...thingFields,
      bucket: (t.bucket as Exclude<ThingBucket, "inbox">) ?? "next",
      rawCapture: (t.rawCapture as string) || undefined,
    };
  }

  if (type === TYPE_MAP.project) {
    return {
      ...base,
      bucket: "project" as const,
      desiredOutcome: (t.desiredOutcome as string) ?? "",
      status: (t.status as Project["status"]) ?? "active",
      actionIds: (t.actionIds as CanonicalId[]) ?? [],
      reviewDate: (t.reviewDate as string) || undefined,
      completedAt: (t.completedAt as string) || undefined,
      isFocused: (t.isFocused as boolean) ?? false,
    };
  }

  if (type === TYPE_MAP.reference) {
    return {
      ...base,
      bucket: "reference" as const,
      contentType: (t.contentType as string) || undefined,
      externalUrl: (t.externalUrl as string) || undefined,
      origin: (t.origin as "triaged" | "captured" | "file") || undefined,
    };
  }

  // Fallback: treat unknown types as inbox items
  return {
    ...base,
    ...thingFields,
    bucket: "inbox" as const,
    rawCapture: (t.rawCapture as string) ?? base.title,
  };
}

// ---------------------------------------------------------------------------
// buildTriagePatch — TriageResult → partial JSON-LD for PATCH
// ---------------------------------------------------------------------------

export function buildTriagePatch(
  item: Thing,
  result: TriageResult,
): Record<string, unknown> {
  if (result.targetBucket === "reference") {
    return {
      "@type": TYPE_MAP.reference,
      bucket: "reference",
      contentType: null,
      externalUrl: null,
    };
  }

  // All other triage targets produce an action Thing — include all required fields
  // so the deep-merge with the existing inbox Thing produces a valid action.
  const ports = result.energyLevel
    ? [
        ...(item.ports ?? []),
        { kind: "computation", energyLevel: result.energyLevel },
      ]
    : (item.ports ?? []);

  return {
    "@type": TYPE_MAP.action,
    bucket: result.targetBucket,
    contexts: result.contexts ?? [],
    projectId: result.projectId ?? null,
    scheduledDate: result.date ?? null,
    scheduledTime: null,
    dueDate: null,
    startDate: null,
    delegatedTo: null,
    isFocused: false,
    completedAt: null,
    sequenceOrder: null,
    recurrence: null,
    ports,
  };
}

// ---------------------------------------------------------------------------
// buildItemEditPatch — Partial<ItemEditableFields> → partial JSON-LD for PATCH
// ---------------------------------------------------------------------------

export function buildItemEditPatch(
  fields: Partial<ItemEditableFields>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if ("dueDate" in fields) patch.dueDate = fields.dueDate || null;
  if ("scheduledDate" in fields)
    patch.scheduledDate = fields.scheduledDate || null;
  if ("contexts" in fields) patch.contexts = fields.contexts;
  if ("projectId" in fields) patch.projectId = fields.projectId ?? null;
  if ("notes" in fields) patch.notes = fields.notes || null;
  if ("energyLevel" in fields && fields.energyLevel) {
    patch.ports = [{ kind: "computation", energyLevel: fields.energyLevel }];
  }

  return patch;
}

// ---------------------------------------------------------------------------
// buildNewInboxJsonLd — raw text → full JSON-LD for POST /things
// ---------------------------------------------------------------------------

export function buildNewInboxJsonLd(rawText: string): Record<string, unknown> {
  const id = createCanonicalId("inbox", crypto.randomUUID());
  const now = new Date().toISOString();

  return {
    "@id": id,
    "@type": TYPE_MAP.inbox,
    _schemaVersion: SCHEMA_VERSION,
    title: rawText,
    bucket: "inbox",
    rawCapture: rawText,
    notes: null,
    tags: [],
    references: [],
    captureSource: { kind: "thought" },
    provenance: {
      createdAt: now,
      updatedAt: now,
      history: [{ timestamp: now, action: "created" }],
    },
    ports: [],
    needsEnrichment: true,
    confidence: "low",
  };
}

// ---------------------------------------------------------------------------
// buildNewReferenceJsonLd — title → full JSON-LD for POST /things
// ---------------------------------------------------------------------------

export function buildNewReferenceJsonLd(
  title: string,
): Record<string, unknown> {
  const id = createCanonicalId("reference", crypto.randomUUID());
  const now = new Date().toISOString();

  return {
    "@id": id,
    "@type": TYPE_MAP.reference,
    _schemaVersion: SCHEMA_VERSION,
    title,
    bucket: "reference",
    notes: null,
    tags: [],
    references: [],
    captureSource: { kind: "thought" },
    provenance: {
      createdAt: now,
      updatedAt: now,
      history: [{ timestamp: now, action: "created" }],
    },
    ports: [],
    needsEnrichment: false,
    confidence: "medium",
    contentType: null,
    externalUrl: null,
    origin: "captured",
  };
}
