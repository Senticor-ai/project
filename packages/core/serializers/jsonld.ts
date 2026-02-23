import { randomUUID } from "node:crypto";

const SCHEMA_VERSION = 2;

type PropertyValue = {
  "@type": "PropertyValue";
  propertyID: string;
  value: unknown;
};

function pv(propertyID: string, value: unknown): PropertyValue {
  return {
    "@type": "PropertyValue",
    propertyID,
    value,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function urnPrefix(type: string): string {
  switch (type) {
    case "Project":
      return "project";
    case "Action":
      return "action";
    case "CreativeWork":
    case "DigitalDocument":
      return "reference";
    case "Person":
      return "person";
    default:
      return type.toLowerCase();
  }
}

function sanitizeUrnSegment(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase());
}

function canonicalId(type: string, orgId?: string): string {
  const kind = urnPrefix(type);
  const uuid = randomUUID();
  if (!orgId) {
    return `urn:app:${kind}:${uuid}`;
  }
  return `urn:app:org:${sanitizeUrnSegment(orgId)}:${kind}:${uuid}`;
}

function baseJsonLd(type: string, name?: string, orgId?: string): Record<string, unknown> {
  const now = nowIso();
  return {
    "@id": canonicalId(type, orgId),
    "@type": type,
    _schemaVersion: SCHEMA_VERSION,
    name: name ?? null,
    description: null,
    keywords: [],
    dateCreated: now,
    dateModified: now,
  };
}

function captureSource(conversationId?: string): unknown {
  if (!conversationId) {
    return { kind: "tay-cli" };
  }
  return { kind: "tay-cli", conversationId };
}

function withDefaults(
  item: Record<string, unknown>,
  additionalProperty: PropertyValue[],
): Record<string, unknown> {
  return {
    ...item,
    additionalProperty,
  };
}

export type BuildCreateInput = {
  type: string;
  name: string;
  orgId?: string;
  bucket?: string;
  projectId?: string;
  description?: string;
  url?: string;
  orgRef?: { id?: string; name?: string };
  orgRole?: string;
  email?: string;
  conversationId?: string;
};

export function buildCreateItemJsonLd(input: BuildCreateInput): Record<string, unknown> {
  const type = input.type;
  if (type === "Project") {
    const item = baseJsonLd("Project", input.name, input.orgId);
    return withDefaults(item, [
      pv("app:bucket", "project"),
      pv("app:desiredOutcome", input.description ?? ""),
      pv("app:projectStatus", "active"),
      pv("app:isFocused", false),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "high"),
      pv("app:captureSource", captureSource(input.conversationId)),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: nowIso(), action: "created" }]),
    ]);
  }

  if (type === "Action") {
    const item = {
      ...baseJsonLd("Action", undefined, input.orgId),
      startTime: null,
      endTime: null,
    };
    return withDefaults(item, [
      pv("app:bucket", input.bucket ?? "next"),
      pv("app:rawCapture", input.name),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "high"),
      pv("app:captureSource", captureSource(input.conversationId)),
      pv("app:contexts", []),
      pv("app:isFocused", false),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: nowIso(), action: "created" }]),
      pv("app:projectRefs", input.projectId ? [input.projectId] : []),
    ]);
  }

  if (type === "CreativeWork" || type === "DigitalDocument") {
    const item = {
      ...baseJsonLd(type, input.name, input.orgId),
      description: input.description ?? null,
      url: input.url ?? null,
      encodingFormat: null,
    };
    return withDefaults(item, [
      pv("app:bucket", input.bucket ?? "reference"),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "medium"),
      pv("app:captureSource", captureSource(input.conversationId)),
      pv("app:origin", "captured"),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:projectRefs", input.projectId ? [input.projectId] : []),
      pv("app:provenanceHistory", [{ timestamp: nowIso(), action: "created" }]),
      ...(input.orgRef ? [pv("app:orgRef", JSON.stringify(input.orgRef))] : []),
      ...(input.orgRole ? [pv("app:orgRole", input.orgRole)] : []),
    ]);
  }

  if (type === "Person") {
    const item = {
      ...baseJsonLd("Person", input.name, input.orgId),
      description: input.description ?? null,
      email: input.email ?? null,
    };

    return withDefaults(item, [
      pv("app:bucket", input.bucket ?? "reference"),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "medium"),
      pv("app:captureSource", captureSource(input.conversationId)),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:projectRefs", input.projectId ? [input.projectId] : []),
      pv("app:provenanceHistory", [{ timestamp: nowIso(), action: "created" }]),
      ...(input.orgRef ? [pv("app:orgRef", JSON.stringify(input.orgRef))] : []),
      ...(input.orgRole ? [pv("app:orgRole", input.orgRole)] : []),
    ]);
  }

  const generic = baseJsonLd(type, input.name, input.orgId);
  return withDefaults(generic, [
    pv("app:bucket", input.bucket ?? "inbox"),
    pv("app:captureSource", captureSource(input.conversationId)),
    pv("app:provenanceHistory", [{ timestamp: nowIso(), action: "created" }]),
  ]);
}

export function buildBucketPatch(targetBucket: string): Record<string, unknown> {
  return {
    additionalProperty: [
      {
        "@type": "PropertyValue",
        propertyID: "app:bucket",
        value: targetBucket,
      },
    ],
  };
}

export function readAdditionalProperty(
  item: Record<string, unknown> | null | undefined,
  propertyID: string,
): unknown {
  if (!item || typeof item !== "object") {
    return undefined;
  }
  const additional = (item.additionalProperty ?? []) as Array<Record<string, unknown>>;
  for (const entry of additional) {
    if (entry?.propertyID === propertyID) {
      return entry.value;
    }
  }
  return undefined;
}

export function itemType(item: Record<string, unknown>): string {
  const typeValue = item["@type"];
  if (typeof typeValue === "string") {
    return typeValue;
  }
  if (Array.isArray(typeValue) && typeValue.length > 0 && typeof typeValue[0] === "string") {
    return typeValue[0];
  }
  return "Unknown";
}
