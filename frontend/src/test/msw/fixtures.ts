import type { ItemRecord, SyncResponse, FileRecord } from "@/lib/api-client";
import type { CanonicalId } from "@/model/canonical-id";

// ---------------------------------------------------------------------------
// In-memory store — shared between handlers and story setup
// ---------------------------------------------------------------------------

export const store = {
  items: new Map<string, ItemRecord>(),
  clear() {
    this.items.clear();
  },
  seed(records: ItemRecord[]) {
    this.clear();
    for (const r of records) this.items.set(r.item_id, r);
  },
};

// ---------------------------------------------------------------------------
// PropertyValue helper
// ---------------------------------------------------------------------------

function pv(propertyID: string, value: unknown) {
  return { "@type": "PropertyValue" as const, propertyID, value };
}

// ---------------------------------------------------------------------------
// ItemRecord factory
// ---------------------------------------------------------------------------

let counter = 0;

export function createItemRecord(
  overrides: Partial<ItemRecord> & {
    bucket?: string;
    type?: string;
    name?: string;
    isFocused?: boolean;
    rawCapture?: string;
    completedAt?: string;
    projectId?: CanonicalId;
    desiredOutcome?: string;
    projectStatus?: string;
    origin?: string;
    url?: string;
    startDate?: string;
    endDate?: string;
    duration?: string;
    location?: string;
  } = {},
): ItemRecord {
  counter++;
  const id = overrides.item_id ?? `item-${counter}`;
  const now = new Date().toISOString();
  const bucket = overrides.bucket ?? "inbox";
  const type =
    overrides.type ??
    (bucket === "project"
      ? "Project"
      : bucket === "reference"
        ? "CreativeWork"
        : "Action");
  const isEvent = type === "Event";
  const canonicalId =
    overrides.canonical_id ??
    (`urn:app:${bucket === "project" ? "project" : bucket === "reference" ? "reference" : bucket === "inbox" ? "inbox" : "action"}:${id}` as CanonicalId);
  const displayName =
    overrides.name ?? overrides.rawCapture ?? `Item ${counter}`;

  const base: Record<string, unknown> = {
    "@id": canonicalId,
    "@type": type,
    _schemaVersion: 2,
    name: overrides.name ?? (bucket !== "inbox" ? displayName : undefined),
    description: null,
    keywords: [],
    dateCreated: now,
    dateModified: now,
  };

  if (type === "Action") {
    base.startTime = null;
    base.endTime = overrides.completedAt ?? null;
    base.additionalProperty = [
      pv("app:bucket", bucket),
      pv("app:rawCapture", overrides.rawCapture ?? displayName),
      pv("app:needsEnrichment", bucket === "inbox"),
      pv("app:confidence", bucket === "inbox" ? "medium" : "high"),
      pv("app:captureSource", { kind: "thought" }),
      pv("app:contexts", []),
      pv("app:isFocused", overrides.isFocused ?? false),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
      pv("app:projectRefs", overrides.projectId ? [overrides.projectId] : []),
    ];
  } else if (type === "Project") {
    base.additionalProperty = [
      pv("app:bucket", "project"),
      pv("app:desiredOutcome", overrides.desiredOutcome ?? ""),
      pv("app:projectStatus", overrides.projectStatus ?? "active"),
      pv("app:isFocused", overrides.isFocused ?? false),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "high"),
      pv("app:captureSource", { kind: "thought" }),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
    ];
  } else if (type === "CreativeWork") {
    base.url = overrides.url ?? null;
    base.encodingFormat = null;
    base.additionalProperty = [
      pv("app:bucket", "reference"),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "medium"),
      pv("app:captureSource", { kind: "thought" }),
      pv("app:origin", overrides.origin ?? "captured"),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
    ];
  } else if (isEvent) {
    base.startDate = overrides.startDate ?? null;
    base.endDate = overrides.endDate ?? null;
    base.duration = overrides.duration ?? null;
    base.location = overrides.location ?? null;
    base.additionalProperty = [
      pv("app:bucket", "calendar"),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "high"),
      pv("app:captureSource", { kind: "thought" }),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
    ];
  }

  return {
    item_id: id,
    canonical_id: canonicalId,
    source: "manual",
    item: base,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Preset seed data sets
// ---------------------------------------------------------------------------

export function seedInboxItems(count = 3): ItemRecord[] {
  const records = Array.from({ length: count }, (_, i) =>
    createItemRecord({
      item_id: `inbox-${i + 1}`,
      bucket: "inbox",
      rawCapture: `Inbox item ${i + 1}`,
    }),
  );
  store.seed(records);
  return records;
}

export function seedMixedBuckets(): ItemRecord[] {
  const records = [
    createItemRecord({
      item_id: "inbox-1",
      bucket: "inbox",
      rawCapture: "Unprocessed thought",
    }),
    createItemRecord({
      item_id: "inbox-2",
      bucket: "inbox",
      rawCapture: "Another capture",
    }),
    createItemRecord({
      item_id: "next-1",
      bucket: "next",
      name: "Draft wireframes",
    }),
    createItemRecord({
      item_id: "next-2",
      bucket: "next",
      name: "Review PR",
      isFocused: true,
    }),
    createItemRecord({
      item_id: "waiting-1",
      bucket: "waiting",
      name: "Waiting on vendor",
    }),
    createItemRecord({
      item_id: "someday-1",
      bucket: "someday",
      name: "Learn Rust",
    }),
    createItemRecord({
      item_id: "project-1",
      bucket: "project",
      name: "Website Redesign",
      desiredOutcome: "Launch new site",
    }),
    createItemRecord({
      item_id: "ref-1",
      bucket: "reference",
      name: "Brand guidelines",
      type: "CreativeWork",
    }),
  ];
  store.seed(records);
  return records;
}

// ---------------------------------------------------------------------------
// SyncResponse builder
// ---------------------------------------------------------------------------

export function buildSyncResponse(records: ItemRecord[]): SyncResponse {
  return {
    items: records,
    next_cursor: null,
    has_more: false,
    server_time: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// File upload fixture
// ---------------------------------------------------------------------------

export function createFileRecord(
  overrides: Partial<FileRecord> = {},
): FileRecord {
  return {
    file_id: "file-msw-1",
    original_name: "nirvana-export.json",
    content_type: "application/json",
    size_bytes: 12345,
    sha256: "abc123def456",
    created_at: new Date().toISOString(),
    download_url: "/files/file-msw-1",
    ...overrides,
  };
}
