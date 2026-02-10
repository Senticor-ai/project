import type { ItemRecord } from "./api-client";
import type {
  ActionItem,
  ActionItemBucket,
  Project,
  ReferenceMaterial,
  CalendarEntry,
  AppItem,
  CaptureSource,
  Provenance,
  TypedReference,
  Port,
  TriageResult,
  ItemEditableFields,
} from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";
import { createCanonicalId } from "@/model/canonical-id";
import type { IntakeClassification } from "./intake-classifier";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = 2;

/** schema.org @type values keyed by our internal bucket concept. */
const TYPE_MAP = {
  action: "Action",
  project: "Project",
  reference: "CreativeWork",
  event: "Event",
} as const;

// ---------------------------------------------------------------------------
// PropertyValue helpers
// ---------------------------------------------------------------------------

interface PropertyValue {
  "@type": "PropertyValue";
  propertyID: string;
  value: unknown;
}

function pv(propertyID: string, value: unknown): PropertyValue {
  return { "@type": "PropertyValue", propertyID, value };
}

function getAdditionalProperty(
  props: PropertyValue[] | undefined,
  propertyID: string,
): unknown {
  return props?.find((p) => p.propertyID === propertyID)?.value;
}

// ---------------------------------------------------------------------------
// toJsonLd — Frontend GTD entity → schema.org JSON-LD for the backend
// ---------------------------------------------------------------------------

function serializeActionItemAdditionalProps(
  thing: ActionItem,
): PropertyValue[] {
  const props: PropertyValue[] = [
    pv("app:bucket", thing.bucket),
    pv("app:needsEnrichment", thing.needsEnrichment),
    pv("app:confidence", thing.confidence),
    pv("app:captureSource", thing.captureSource),
    pv("app:contexts", thing.contexts),
    pv("app:isFocused", thing.isFocused),
    pv("app:ports", thing.ports),
    pv("app:typedReferences", thing.references),
    pv("app:provenanceHistory", thing.provenance.history),
  ];

  if (thing.projectIds.length > 0) {
    props.push(pv("app:projectRefs", thing.projectIds));
  }

  if (thing.rawCapture !== undefined) {
    props.push(pv("app:rawCapture", thing.rawCapture));
  }
  if (thing.delegatedTo !== undefined) {
    props.push(pv("app:delegatedTo", thing.delegatedTo));
  }
  if (thing.dueDate !== undefined) {
    props.push(pv("app:dueDate", thing.dueDate));
  }
  if (thing.startDate !== undefined) {
    props.push(pv("app:startDate", thing.startDate));
  }
  if (thing.scheduledTime !== undefined) {
    props.push(pv("app:scheduledTime", thing.scheduledTime));
  }
  if (thing.sequenceOrder !== undefined) {
    props.push(pv("app:sequenceOrder", thing.sequenceOrder));
  }
  if (thing.recurrence !== undefined) {
    props.push(pv("app:recurrence", thing.recurrence));
  }

  return props;
}

export function toJsonLd(
  item: ActionItem | Project | ReferenceMaterial,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    "@id": item.id,
    _schemaVersion: SCHEMA_VERSION,
    description: item.description ?? null,
    keywords: item.tags,
    dateCreated: item.provenance.createdAt,
    dateModified: item.provenance.updatedAt,
  };

  if (item.name) {
    base.name = item.name;
  }

  if (
    item.bucket === "inbox" ||
    item.bucket === "next" ||
    item.bucket === "waiting" ||
    item.bucket === "calendar" ||
    item.bucket === "someday"
  ) {
    const actionItem = item as ActionItem;
    base["@type"] = TYPE_MAP.action;
    base.startTime = actionItem.scheduledDate ?? null;
    base.endTime = actionItem.completedAt ?? null;
    base.additionalProperty = serializeActionItemAdditionalProps(actionItem);
  } else if (item.bucket === "project") {
    const project = item as Project;
    base["@type"] = TYPE_MAP.project;

    const props: PropertyValue[] = [
      pv("app:bucket", "project"),
      pv("app:desiredOutcome", project.desiredOutcome),
      pv("app:projectStatus", project.status),
      pv("app:isFocused", project.isFocused),
      pv("app:needsEnrichment", project.needsEnrichment),
      pv("app:confidence", project.confidence),
      pv("app:captureSource", project.captureSource),
      pv("app:ports", project.ports),
      pv("app:typedReferences", project.references),
      pv("app:provenanceHistory", project.provenance.history),
    ];
    if (project.reviewDate !== undefined) {
      props.push(pv("app:reviewDate", project.reviewDate));
    }
    base.additionalProperty = props;
  } else if (item.bucket === "reference") {
    const ref = item as ReferenceMaterial;
    base["@type"] = TYPE_MAP.reference;
    base.url = ref.url ?? null;
    base.encodingFormat = ref.encodingFormat ?? null;

    base.additionalProperty = [
      pv("app:bucket", "reference"),
      pv("app:needsEnrichment", ref.needsEnrichment),
      pv("app:confidence", ref.confidence),
      pv("app:captureSource", ref.captureSource),
      pv("app:ports", ref.ports),
      pv("app:typedReferences", ref.references),
      pv("app:provenanceHistory", ref.provenance.history),
      pv("app:origin", ref.origin ?? null),
    ];
  }

  return base;
}

// ---------------------------------------------------------------------------
// fromJsonLd — ItemRecord from backend → Frontend GTD entity
// ---------------------------------------------------------------------------

export function fromJsonLd(record: ItemRecord): AppItem {
  const t = record.item;
  const type = t["@type"] as string;
  const props = t.additionalProperty as PropertyValue[] | undefined;

  const base = {
    id:
      (t["@id"] as string as CanonicalId) ??
      (record.canonical_id as CanonicalId),
    name: ((t.name as string) ?? "").trim() || undefined,
    description: (t.description as string) || undefined,
    tags: (t.keywords as string[]) ?? [],
    references:
      (getAdditionalProperty(
        props,
        "app:typedReferences",
      ) as TypedReference[]) ?? [],
    captureSource: (getAdditionalProperty(
      props,
      "app:captureSource",
    ) as CaptureSource) ?? {
      kind: "thought" as const,
    },
    provenance: {
      createdAt: (t.dateCreated as string) ?? record.created_at,
      updatedAt: (t.dateModified as string) ?? record.updated_at,
      history:
        (getAdditionalProperty(
          props,
          "app:provenanceHistory",
        ) as Provenance["history"]) ?? [],
    },
    ports: (getAdditionalProperty(props, "app:ports") as Port[]) ?? [],
    needsEnrichment:
      (getAdditionalProperty(props, "app:needsEnrichment") as boolean) ?? true,
    confidence:
      (getAdditionalProperty(props, "app:confidence") as
        | "high"
        | "medium"
        | "low") ?? "low",
  };

  const thingFields = {
    contexts:
      (getAdditionalProperty(props, "app:contexts") as CanonicalId[]) ?? [],
    projectIds:
      (getAdditionalProperty(props, "app:projectRefs") as CanonicalId[]) ?? [],
    delegatedTo:
      (getAdditionalProperty(props, "app:delegatedTo") as string) || undefined,
    scheduledDate:
      (t.startTime as string) ||
      (getAdditionalProperty(props, "app:scheduledDate") as string) ||
      undefined,
    scheduledTime:
      (getAdditionalProperty(props, "app:scheduledTime") as string) ||
      undefined,
    dueDate:
      (getAdditionalProperty(props, "app:dueDate") as string) || undefined,
    startDate:
      (getAdditionalProperty(props, "app:startDate") as string) || undefined,
    isFocused:
      (getAdditionalProperty(props, "app:isFocused") as boolean) ?? false,
    recurrence: getAdditionalProperty(
      props,
      "app:recurrence",
    ) as ActionItem["recurrence"],
    completedAt: (t.endTime as string) || undefined,
    sequenceOrder:
      (getAdditionalProperty(props, "app:sequenceOrder") as number) ||
      undefined,
  };

  if (type === TYPE_MAP.action || type === "Action") {
    const bucket =
      (getAdditionalProperty(props, "app:bucket") as ActionItemBucket) ??
      "next";
    return {
      ...base,
      ...thingFields,
      bucket,
      rawCapture:
        (getAdditionalProperty(props, "app:rawCapture") as string) ||
        (bucket === "inbox" ? base.name : undefined),
    };
  }

  if (type === TYPE_MAP.project || type === "Project") {
    return {
      ...base,
      bucket: "project" as const,
      desiredOutcome:
        (getAdditionalProperty(props, "app:desiredOutcome") as string) ?? "",
      status:
        (getAdditionalProperty(
          props,
          "app:projectStatus",
        ) as Project["status"]) ?? "active",
      reviewDate:
        (getAdditionalProperty(props, "app:reviewDate") as string) || undefined,
      completedAt: (t.endTime as string) || undefined,
      isFocused:
        (getAdditionalProperty(props, "app:isFocused") as boolean) ?? false,
    };
  }

  if (type === TYPE_MAP.reference || type === "CreativeWork") {
    const bucket = getAdditionalProperty(props, "app:bucket") as string;
    if (bucket === "inbox") {
      return {
        ...base,
        ...thingFields,
        bucket: "inbox" as const,
        rawCapture:
          (getAdditionalProperty(props, "app:rawCapture") as string) ||
          base.name,
      };
    }
    return {
      ...base,
      bucket: "reference" as const,
      encodingFormat: (t.encodingFormat as string) || undefined,
      url: (t.url as string) || undefined,
      origin:
        (getAdditionalProperty(props, "app:origin") as
          | "triaged"
          | "captured"
          | "file") || undefined,
    };
  }

  if (type === TYPE_MAP.event || type === "Event") {
    const startDate = (t.startDate as string) || undefined;
    return {
      ...base,
      bucket: "calendar" as const,
      date: startDate ?? "",
      time:
        (getAdditionalProperty(props, "app:scheduledTime") as string) ||
        undefined,
      duration: (t.duration as number) || undefined,
      isAllDay: !startDate?.includes("T"),
    } satisfies CalendarEntry;
  }

  // Fallback: treat unknown types as inbox items
  return {
    ...base,
    ...thingFields,
    bucket: "inbox" as const,
    rawCapture:
      (getAdditionalProperty(props, "app:rawCapture") as string) ?? base.name,
  };
}

// ---------------------------------------------------------------------------
// buildTriagePatch — TriageResult → partial JSON-LD for PATCH
// ---------------------------------------------------------------------------

export function buildTriagePatch(
  item: ActionItem,
  result: TriageResult,
): Record<string, unknown> {
  if (result.targetBucket === "reference") {
    return {
      "@type": TYPE_MAP.reference,
      additionalProperty: [pv("app:bucket", "reference")],
    };
  }

  const ports = result.energyLevel
    ? [
        ...(item.ports ?? []),
        { kind: "computation", energyLevel: result.energyLevel },
      ]
    : (item.ports ?? []);

  const additionalProps: PropertyValue[] = [
    pv("app:bucket", result.targetBucket),
    pv("app:contexts", result.contexts ?? []),
    pv("app:isFocused", false),
    pv("app:dueDate", null),
    pv("app:startDate", null),
    pv("app:delegatedTo", null),
    pv("app:scheduledTime", null),
    pv("app:sequenceOrder", null),
    pv("app:recurrence", null),
    pv("app:ports", ports),
    pv("app:projectRefs", result.projectId ? [result.projectId] : []),
  ];

  return {
    "@type": TYPE_MAP.action,
    startTime: result.date ?? null,
    endTime: null,
    additionalProperty: additionalProps,
  };
}

// ---------------------------------------------------------------------------
// buildItemEditPatch — Partial<ItemEditableFields> → partial JSON-LD for PATCH
// ---------------------------------------------------------------------------

export function buildItemEditPatch(
  fields: Partial<ItemEditableFields>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const additionalProps: PropertyValue[] = [];

  if ("dueDate" in fields) {
    additionalProps.push(pv("app:dueDate", fields.dueDate || null));
  }
  if ("scheduledDate" in fields) {
    patch.startTime = fields.scheduledDate || null;
  }
  if ("contexts" in fields) {
    additionalProps.push(pv("app:contexts", fields.contexts));
  }
  if ("projectId" in fields) {
    additionalProps.push(
      pv("app:projectRefs", fields.projectId ? [fields.projectId] : []),
    );
  }
  if ("description" in fields) {
    patch.description = fields.description || null;
  }
  if ("energyLevel" in fields && fields.energyLevel) {
    additionalProps.push(
      pv("app:ports", [
        { kind: "computation", energyLevel: fields.energyLevel },
      ]),
    );
  }

  if (additionalProps.length > 0) {
    patch.additionalProperty = additionalProps;
  }

  return patch;
}

// ---------------------------------------------------------------------------
// buildNewInboxJsonLd — raw text → full JSON-LD for POST /items
// ---------------------------------------------------------------------------

export function buildNewInboxJsonLd(rawText: string): Record<string, unknown> {
  const id = createCanonicalId("inbox", crypto.randomUUID());
  const now = new Date().toISOString();

  return {
    "@id": id,
    "@type": TYPE_MAP.action,
    _schemaVersion: SCHEMA_VERSION,
    description: null,
    keywords: [],
    dateCreated: now,
    dateModified: now,
    startTime: null,
    endTime: null,
    additionalProperty: [
      pv("app:bucket", "inbox"),
      pv("app:rawCapture", rawText),
      pv("app:needsEnrichment", true),
      pv("app:confidence", "medium"),
      pv("app:captureSource", { kind: "thought" }),
      pv("app:contexts", []),
      pv("app:isFocused", false),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
    ],
  };
}

// ---------------------------------------------------------------------------
// buildNewActionJsonLd — rapid action entry → full JSON-LD for POST /items
// ---------------------------------------------------------------------------

export function buildNewActionJsonLd(
  text: string,
  bucket: string,
  opts?: { projectId?: CanonicalId },
): Record<string, unknown> {
  const id = createCanonicalId("action", crypto.randomUUID());
  const now = new Date().toISOString();

  return {
    "@id": id,
    "@type": TYPE_MAP.action,
    _schemaVersion: SCHEMA_VERSION,
    description: null,
    keywords: [],
    dateCreated: now,
    dateModified: now,
    startTime: null,
    endTime: null,
    additionalProperty: [
      pv("app:bucket", bucket),
      pv("app:rawCapture", text),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "high"),
      pv("app:captureSource", { kind: "thought" }),
      pv("app:contexts", []),
      pv("app:isFocused", false),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
      pv("app:projectRefs", opts?.projectId ? [opts.projectId] : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// buildNewFileInboxJsonLd — file drop → full JSON-LD for POST /items
// ---------------------------------------------------------------------------

export function buildNewFileInboxJsonLd(
  classification: IntakeClassification,
  fileName: string,
): Record<string, unknown> {
  const id = createCanonicalId("inbox", crypto.randomUUID());
  const now = new Date().toISOString();

  const additionalProps = [
    pv("app:bucket", "inbox"),
    pv("app:needsEnrichment", true),
    pv("app:confidence", "medium"),
    pv("app:captureSource", classification.captureSource),
    pv("app:contexts", []),
    pv("app:isFocused", false),
    pv("app:ports", []),
    pv("app:typedReferences", []),
    pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
  ];

  if (classification.extractableEntities) {
    additionalProps.push(
      pv("app:extractableEntities", classification.extractableEntities),
    );
  }

  return {
    "@id": id,
    "@type": classification.schemaType,
    _schemaVersion: SCHEMA_VERSION,
    name: fileName,
    description: null,
    keywords: [],
    encodingFormat: classification.encodingFormat ?? null,
    dateCreated: now,
    dateModified: now,
    additionalProperty: additionalProps,
  };
}

// ---------------------------------------------------------------------------
// buildNewUrlInboxJsonLd — URL paste → full JSON-LD for POST /items
// ---------------------------------------------------------------------------

export function buildNewUrlInboxJsonLd(url: string): Record<string, unknown> {
  const id = createCanonicalId("inbox", crypto.randomUUID());
  const now = new Date().toISOString();

  return {
    "@id": id,
    "@type": "CreativeWork",
    _schemaVersion: SCHEMA_VERSION,
    url,
    description: null,
    keywords: [],
    dateCreated: now,
    dateModified: now,
    additionalProperty: [
      pv("app:bucket", "inbox"),
      pv("app:needsEnrichment", true),
      pv("app:confidence", "medium"),
      pv("app:captureSource", { kind: "url" as const, url }),
      pv("app:contexts", []),
      pv("app:isFocused", false),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
    ],
  };
}

// ---------------------------------------------------------------------------
// buildNewProjectJsonLd — name + desiredOutcome → full JSON-LD for POST /items
// ---------------------------------------------------------------------------

export function buildNewProjectJsonLd(
  name: string,
  desiredOutcome: string,
): Record<string, unknown> {
  const id = createCanonicalId("project", crypto.randomUUID());
  const now = new Date().toISOString();

  return {
    "@id": id,
    "@type": TYPE_MAP.project,
    _schemaVersion: SCHEMA_VERSION,
    name,
    description: null,
    keywords: [],
    dateCreated: now,
    dateModified: now,
    additionalProperty: [
      pv("app:bucket", "project"),
      pv("app:desiredOutcome", desiredOutcome),
      pv("app:projectStatus", "active"),
      pv("app:isFocused", false),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "high"),
      pv("app:captureSource", { kind: "thought" }),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
    ],
  };
}

// ---------------------------------------------------------------------------
// buildNewReferenceJsonLd — name → full JSON-LD for POST /items
// ---------------------------------------------------------------------------

export function buildNewReferenceJsonLd(name: string): Record<string, unknown> {
  const id = createCanonicalId("reference", crypto.randomUUID());
  const now = new Date().toISOString();

  return {
    "@id": id,
    "@type": TYPE_MAP.reference,
    _schemaVersion: SCHEMA_VERSION,
    name,
    description: null,
    keywords: [],
    dateCreated: now,
    dateModified: now,
    url: null,
    encodingFormat: null,
    additionalProperty: [
      pv("app:bucket", "reference"),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "medium"),
      pv("app:captureSource", { kind: "thought" }),
      pv("app:origin", "captured"),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
    ],
  };
}
