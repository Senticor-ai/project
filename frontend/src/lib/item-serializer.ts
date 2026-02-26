import type { ItemRecord } from "./api-client";
import type {
  ActionItem,
  ActionItemBucket,
  Project,
  ReferenceMaterial,
  PersonItem,
  OrgDocItem,
  OrgDocType,
  OrgRole,
  CalendarEntry,
  AppItem,
  CaptureSource,
  Provenance,
  TypedReference,
  Port,
  TriageResult,
  ItemEditableFields,
  OrgRef,
  NameProvenance,
} from "../model/types";
import type { CanonicalId } from "../model/canonical-id";
import { createCanonicalId } from "../model/canonical-id";
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

const ACTION_BUCKET_SET = new Set<ActionItemBucket>([
  "inbox",
  "next",
  "waiting",
  "calendar",
  "someday",
]);

/** schema.org Action subtypes recognized by the frontend serializer. */
export const ACTION_SUBTYPES = new Set([
  "Action",
  "PlanAction",
  "BuyAction",
  "CommunicateAction",
  "ReviewAction",
  "CreateAction",
  "SendAction",
  "CheckAction",
]);

function coerceActionBucket(value: unknown): ActionItemBucket {
  return ACTION_BUCKET_SET.has(value as ActionItemBucket)
    ? (value as ActionItemBucket)
    : "inbox";
}

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

function parseOrgRef(props: PropertyValue[] | undefined): OrgRef | undefined {
  const raw = getAdditionalProperty(props, "app:orgRef") as string | undefined;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as OrgRef;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// toJsonLd — Frontend entity → schema.org JSON-LD for the backend
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
  if (thing.nameProvenance !== undefined) {
    props.push(pv("app:nameProvenance", thing.nameProvenance));
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
  if (thing.fileId) {
    props.push(pv("app:fileId", thing.fileId));
  }
  if (thing.downloadUrl) {
    props.push(pv("app:downloadUrl", thing.downloadUrl));
  }

  return props;
}

export function toJsonLd(
  item: ActionItem | Project | ReferenceMaterial | PersonItem,
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
    base["@type"] =
      actionItem.schemaType ??
      (actionItem.objectRef ? "ReadAction" : TYPE_MAP.action);
    if (actionItem.objectRef) {
      base.object = { "@id": actionItem.objectRef };
    }
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
    if (project.fileId) {
      props.push(pv("app:fileId", project.fileId));
    }
    if (project.downloadUrl) {
      props.push(pv("app:downloadUrl", project.downloadUrl));
    }
    if (project.orgRef) {
      props.push(pv("app:orgRef", JSON.stringify(project.orgRef)));
    }
    base.additionalProperty = props;
  } else if (item.bucket === "reference" && isPersonItem(item)) {
    const person = item;
    base["@type"] = "Person";
    if (person.email) base.email = person.email;
    if (person.telephone) base.telephone = person.telephone;
    if (person.jobTitle) base.jobTitle = person.jobTitle;

    const personProps: PropertyValue[] = [
      pv("app:bucket", "reference"),
      pv("app:needsEnrichment", person.needsEnrichment),
      pv("app:confidence", person.confidence),
      pv("app:captureSource", person.captureSource),
      pv("app:ports", person.ports),
      pv("app:typedReferences", person.references),
      pv("app:provenanceHistory", person.provenance.history),
    ];
    if (person.projectIds.length > 0) {
      personProps.push(pv("app:projectRefs", person.projectIds));
    }
    if (person.orgRef) {
      personProps.push(pv("app:orgRef", JSON.stringify(person.orgRef)));
    }
    if (person.orgRole) {
      personProps.push(pv("app:orgRole", person.orgRole));
    }
    base.additionalProperty = personProps;
  } else if (item.bucket === "reference") {
    const ref = item as ReferenceMaterial;
    base["@type"] = TYPE_MAP.reference;
    base.url = ref.url ?? null;
    base.encodingFormat = ref.encodingFormat ?? null;

    const refProps: PropertyValue[] = [
      pv("app:bucket", "reference"),
      pv("app:needsEnrichment", ref.needsEnrichment),
      pv("app:confidence", ref.confidence),
      pv("app:captureSource", ref.captureSource),
      pv("app:ports", ref.ports),
      pv("app:typedReferences", ref.references),
      pv("app:provenanceHistory", ref.provenance.history),
      pv("app:origin", ref.origin ?? null),
    ];
    if (ref.projectIds.length > 0) {
      refProps.push(pv("app:projectRefs", ref.projectIds));
    }
    if (ref.fileId) {
      refProps.push(pv("app:fileId", ref.fileId));
    }
    if (ref.downloadUrl) {
      refProps.push(pv("app:downloadUrl", ref.downloadUrl));
    }
    if (ref.orgRef) {
      refProps.push(pv("app:orgRef", JSON.stringify(ref.orgRef)));
    }
    base.additionalProperty = refProps;
  }

  return base;
}

// ---------------------------------------------------------------------------
// fromJsonLd — ItemRecord from backend → Frontend entity
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
    fileId: (getAdditionalProperty(props, "app:fileId") as string) || undefined,
    downloadUrl:
      (getAdditionalProperty(props, "app:downloadUrl") as string) ||
      // Derive from fileId when agents create items without explicit downloadUrl
      ((getAdditionalProperty(props, "app:fileId") as string)
        ? `/files/${getAdditionalProperty(props, "app:fileId") as string}`
        : undefined),
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

  if (
    type === TYPE_MAP.action ||
    type === "Action" ||
    type === "ReadAction" ||
    ACTION_SUBTYPES.has(type)
  ) {
    const bucket = coerceActionBucket(
      getAdditionalProperty(props, "app:bucket") as ActionItemBucket,
    );
    const objectRef = t.object
      ? ((t.object as { "@id": string })["@id"] as CanonicalId)
      : undefined;
    const schemaType =
      type !== TYPE_MAP.action && type !== "Action" && type !== "ReadAction"
        ? type
        : undefined;
    return {
      ...base,
      ...thingFields,
      bucket,
      rawCapture:
        (getAdditionalProperty(props, "app:rawCapture") as string) ||
        (bucket === "inbox" ? base.name : undefined),
      nameProvenance:
        (getAdditionalProperty(
          props,
          "app:nameProvenance",
        ) as NameProvenance) || undefined,
      objectRef,
      schemaType,
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
      orgRef: parseOrgRef(props),
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
      projectIds:
        (getAdditionalProperty(props, "app:projectRefs") as CanonicalId[]) ??
        [],
      encodingFormat: (t.encodingFormat as string) || undefined,
      url: (t.url as string) || undefined,
      origin:
        (getAdditionalProperty(props, "app:origin") as
          | "triaged"
          | "captured"
          | "file") || undefined,
      orgRef: parseOrgRef(props),
    };
  }

  if (type === "Person") {
    return {
      ...base,
      bucket: "reference" as const,
      projectIds:
        (getAdditionalProperty(props, "app:projectRefs") as CanonicalId[]) ??
        [],
      email: (t.email as string) || undefined,
      telephone: (t.telephone as string) || undefined,
      jobTitle: (t.jobTitle as string) || undefined,
      orgRef: parseOrgRef(props),
      orgRole:
        (getAdditionalProperty(props, "app:orgRole") as OrgRole) || undefined,
    } satisfies PersonItem;
  }

  if (type === TYPE_MAP.event || type === "Event") {
    const startDate = (t.startDate as string) || thingFields.startDate;
    const scheduledTime = thingFields.scheduledTime;
    return {
      ...base,
      ...thingFields,
      bucket: "calendar" as const,
      // Keep event rows compatible with ActionList until dedicated grid/list
      // calendar surfaces are implemented.
      rawCapture:
        (getAdditionalProperty(props, "app:rawCapture") as string) || base.name,
      startDate,
      scheduledDate: thingFields.scheduledDate || startDate,
      date: startDate ?? "",
      time: scheduledTime,
      duration: (t.duration as number) || undefined,
      isAllDay: !startDate?.includes("T"),
    } as CalendarEntry & ActionItem;
  }

  // DigitalDocument in reference bucket → OrgDocItem or ReferenceMaterial
  if (type === "DigitalDocument") {
    const bucket = getAdditionalProperty(props, "app:bucket") as string;
    if (bucket === "reference") {
      const orgDocType = getAdditionalProperty(props, "app:orgDocType") as
        | OrgDocType
        | undefined;
      const refBase = {
        ...base,
        bucket: "reference" as const,
        projectIds:
          (getAdditionalProperty(props, "app:projectRefs") as CanonicalId[]) ??
          [],
        encodingFormat: (t.encodingFormat as string) || undefined,
        url: (t.url as string) || undefined,
        origin:
          (getAdditionalProperty(props, "app:origin") as
            | "triaged"
            | "captured"
            | "file") || undefined,
        orgRef: parseOrgRef(props),
      };
      if (orgDocType) {
        return { ...refBase, orgDocType } satisfies OrgDocItem;
      }
      return refBase;
    }
  }

  if (type === "EmailMessage" || type === "DigitalDocument") {
    const bucket = coerceActionBucket(
      getAdditionalProperty(props, "app:bucket") as ActionItemBucket,
    );
    // For EmailMessage, extract sender info for captureSource if not already set
    const captureSource = (getAdditionalProperty(
      props,
      "app:captureSource",
    ) as CaptureSource) ?? {
      kind: "email" as const,
      subject: (t.name as string) || undefined,
      from: (t.sender as { email?: string } | undefined)?.email || undefined,
    };
    return {
      ...base,
      ...thingFields,
      captureSource,
      bucket,
      rawCapture:
        (getAdditionalProperty(props, "app:rawCapture") as string) ||
        (bucket === "inbox" ? base.name : undefined),
      emailBody:
        (getAdditionalProperty(props, "app:emailBody") as string) || undefined,
      emailSourceUrl:
        (getAdditionalProperty(props, "app:emailSourceUrl") as string) ||
        undefined,
    };
  }

  const fallbackBucket = getAdditionalProperty(props, "app:bucket");
  if (fallbackBucket === "project") {
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
      orgRef: parseOrgRef(props),
    };
  }

  if (fallbackBucket === "reference") {
    return {
      ...base,
      bucket: "reference" as const,
      projectIds:
        (getAdditionalProperty(props, "app:projectRefs") as CanonicalId[]) ??
        [],
      encodingFormat: (t.encodingFormat as string) || undefined,
      url: (t.url as string) || undefined,
      origin:
        (getAdditionalProperty(props, "app:origin") as
          | "triaged"
          | "captured"
          | "file") || undefined,
      orgRef: parseOrgRef(props),
    };
  }

  // Forward-compat fallback: unknown @type still renders as actionable item.
  const fallbackActionBucket = coerceActionBucket(
    getAdditionalProperty(props, "app:bucket") as ActionItemBucket,
  );
  return {
    ...base,
    ...thingFields,
    bucket: fallbackActionBucket,
    rawCapture:
      (getAdditionalProperty(props, "app:rawCapture") as string) ||
      (fallbackActionBucket === "inbox" ? base.name : undefined),
    nameProvenance:
      (getAdditionalProperty(props, "app:nameProvenance") as NameProvenance) ||
      undefined,
    objectRef: t.object
      ? ((t.object as { "@id": string })["@id"] as CanonicalId)
      : undefined,
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
    const refProps: PropertyValue[] = [pv("app:bucket", "reference")];
    if (result.projectId) {
      refProps.push(pv("app:projectRefs", [result.projectId]));
    }
    return {
      "@type": TYPE_MAP.reference,
      keywords: item.tags,
      additionalProperty: refProps,
    };
  }

  if (result.targetBucket === "calendar") {
    const startDate = result.date || item.startDate || item.scheduledDate;
    if (!startDate) {
      throw new Error("Calendar triage requires a date");
    }
    const eventProps: PropertyValue[] = [
      pv("app:bucket", "calendar"),
      pv("app:contexts", result.contexts ?? []),
      pv("app:isFocused", false),
      pv("app:dueDate", null),
      pv("app:scheduledTime", null),
      pv("app:sequenceOrder", null),
      pv("app:recurrence", null),
      pv("app:ports", item.ports ?? []),
      pv("app:projectRefs", result.projectId ? [result.projectId] : []),
    ];
    return {
      "@type": TYPE_MAP.event,
      keywords: item.tags,
      startDate,
      endDate: null,
      startTime: null,
      endTime: null,
      additionalProperty: eventProps,
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
    keywords: item.tags,
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
  if ("title" in fields && fields.title !== undefined) {
    patch.name = fields.title;
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
  if ("tags" in fields) {
    patch.keywords = fields.tags;
  }
  if ("orgRef" in fields) {
    additionalProps.push(
      pv("app:orgRef", fields.orgRef ? JSON.stringify(fields.orgRef) : null),
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
      pv("app:rawCapture", url),
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

export function buildNewReferenceJsonLd(
  name: string,
  opts?: { projectId?: CanonicalId },
): Record<string, unknown> {
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
      pv("app:projectRefs", opts?.projectId ? [opts.projectId] : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// buildNewFileReferenceJsonLd — DigitalDocument inbox item → reference copy
// ---------------------------------------------------------------------------

export function buildNewFileReferenceJsonLd(
  sourceItem: ActionItem,
  sourceRecord: ItemRecord,
): Record<string, unknown> {
  const id = createCanonicalId("reference", crypto.randomUUID());
  const now = new Date().toISOString();
  const t = sourceRecord.item;

  return {
    "@id": id,
    "@type": "DigitalDocument",
    _schemaVersion: SCHEMA_VERSION,
    name: sourceItem.name ?? null,
    description: sourceItem.description ?? null,
    keywords: sourceItem.tags ?? [],
    encodingFormat: (t.encodingFormat as string) ?? null,
    dateCreated: now,
    dateModified: now,
    additionalProperty: [
      pv("app:bucket", "reference"),
      pv("app:origin", "triaged"),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "high"),
      pv("app:captureSource", sourceItem.captureSource),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [
        { timestamp: now, action: "created", splitFrom: sourceItem.id },
      ]),
      ...(sourceItem.projectIds.length > 0
        ? [pv("app:projectRefs", sourceItem.projectIds)]
        : []),
      ...(sourceItem.fileId ? [pv("app:fileId", sourceItem.fileId)] : []),
      ...(sourceItem.downloadUrl
        ? [pv("app:downloadUrl", sourceItem.downloadUrl)]
        : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// buildReadActionTriagePatch — Convert existing item to ReadAction with ref
// ---------------------------------------------------------------------------

export function buildReadActionTriagePatch(
  item: ActionItem,
  result: TriageResult,
  referenceId: CanonicalId,
): Record<string, unknown> {
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
    // Clear file-specific props — the reference now owns these
    pv("app:fileId", null),
    pv("app:downloadUrl", null),
  ];

  return {
    "@type": "ReadAction",
    object: { "@id": referenceId },
    startTime: result.date ?? null,
    endTime: null,
    additionalProperty: additionalProps,
  };
}

// ---------------------------------------------------------------------------
// Type guards for reference sub-types
// ---------------------------------------------------------------------------

export function isPersonItem(item: AppItem): item is PersonItem {
  return item.bucket === "reference" && "orgRole" in item;
}

export function isOrgDocItem(item: ReferenceMaterial): item is OrgDocItem {
  return "orgDocType" in item && (item as OrgDocItem).orgDocType !== undefined;
}
