import type {
  ItemRecord,
  SyncResponse,
  FileRecord,
  EmailConnectionResponse,
} from "@/lib/api-client";
import type { CanonicalId } from "@/model/canonical-id";

// ---------------------------------------------------------------------------
// In-memory store — shared between handlers and story setup
// ---------------------------------------------------------------------------

export const store = {
  items: new Map<string, ItemRecord>(),
  emailConnections: new Map<string, EmailConnectionResponse>(),
  clear() {
    this.items.clear();
    this.emailConnections.clear();
  },
  seed(records: ItemRecord[]) {
    this.items.clear();
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
    encodingFormat?: string;
    fileId?: string;
    downloadUrl?: string;
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
  } else if (type === "DigitalDocument" || type === "EmailMessage") {
    base.name = overrides.name ?? displayName;
    base.encodingFormat = overrides.encodingFormat ?? null;
    base.additionalProperty = [
      pv("app:bucket", bucket),
      pv("app:rawCapture", overrides.rawCapture ?? displayName),
      pv("app:needsEnrichment", true),
      pv("app:confidence", "medium"),
      pv(
        "app:captureSource",
        type === "EmailMessage"
          ? { kind: "email" }
          : {
              kind: "file",
              fileName: displayName,
              mimeType: "application/pdf",
            },
      ),
      pv("app:contexts", []),
      pv("app:isFocused", overrides.isFocused ?? false),
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

  // Append file fields to additionalProperty when provided
  if (overrides.fileId || overrides.downloadUrl) {
    const props = base.additionalProperty as Array<Record<string, unknown>>;
    if (overrides.fileId) {
      props.push(pv("app:fileId", overrides.fileId));
    }
    if (overrides.downloadUrl) {
      props.push(pv("app:downloadUrl", overrides.downloadUrl));
    }
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

export function seedMixedBucketsWithFiles(): ItemRecord[] {
  const records = [
    ...seedMixedBuckets(),
    createItemRecord({
      item_id: "file-inbox-1",
      bucket: "inbox",
      type: "DigitalDocument",
      name: "Quarterly Report.pdf",
      encodingFormat: "application/pdf",
    }),
    createItemRecord({
      item_id: "file-inbox-2",
      bucket: "inbox",
      type: "DigitalDocument",
      name: "Meeting Notes.docx",
      encodingFormat:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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

// ---------------------------------------------------------------------------
// Email item fixture
// ---------------------------------------------------------------------------

export function createEmailItemRecord(
  overrides: {
    item_id?: string;
    subject?: string;
    from?: string;
    fromName?: string;
    snippet?: string;
    bucket?: string;
  } = {},
): ItemRecord {
  counter++;
  const id = overrides.item_id ?? `email-${counter}`;
  const now = new Date().toISOString();
  const bucket = overrides.bucket ?? "inbox";
  const subject = overrides.subject ?? `Email subject ${counter}`;
  const fromEmail = overrides.from ?? "sender@example.de";
  const fromName = overrides.fromName ?? "Hans Schmidt";
  const snippet =
    overrides.snippet ?? "Sehr geehrte Frau Muller, hiermit teile ich...";
  const canonicalId = `urn:app:email:${id}` as CanonicalId;

  const item: Record<string, unknown> = {
    "@id": canonicalId,
    "@type": "EmailMessage",
    _schemaVersion: 2,
    name: subject,
    description: null,
    keywords: [],
    dateCreated: now,
    dateModified: now,
    sender: { "@type": "Person", name: fromName, email: fromEmail },
    toRecipient: [{ "@type": "Person", email: "beamte@bund.de" }],
    additionalProperty: [
      pv("app:bucket", bucket),
      pv("app:rawCapture", snippet),
      pv("app:needsEnrichment", bucket === "inbox"),
      pv("app:confidence", "medium"),
      pv("app:captureSource", {
        kind: "email",
        subject,
        from: fromEmail,
      }),
      pv("app:contexts", []),
      pv("app:isFocused", false),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
      pv("app:projectRefs", []),
      pv("app:emailBody", `<p>${snippet}</p>`),
      pv("app:emailSourceUrl", `https://mail.google.com/mail/u/0/#inbox/${id}`),
    ],
    startTime: null,
    endTime: null,
  };

  return {
    item_id: id,
    canonical_id: canonicalId,
    source: "gmail",
    item,
    created_at: now,
    updated_at: now,
  };
}

// ---------------------------------------------------------------------------
// Email connection fixture
// ---------------------------------------------------------------------------

export function createEmailConnection(
  overrides: Partial<EmailConnectionResponse> = {},
): EmailConnectionResponse {
  return {
    connection_id: "conn-1",
    email_address: "beamte@bund.de",
    display_name: "Beamter",
    auth_method: "oauth2",
    oauth_provider: "gmail",
    sync_interval_minutes: 15,
    sync_mark_read: false,
    last_sync_at: new Date().toISOString(),
    last_sync_error: null,
    last_sync_message_count: 12,
    is_active: true,
    watch_active: false,
    watch_expires_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Seed helpers with email items
// ---------------------------------------------------------------------------

export function seedMixedBucketsWithEmail(): ItemRecord[] {
  const records = [
    ...seedMixedBuckets(),
    createEmailItemRecord({
      item_id: "email-inbox-1",
      subject: "Re: Antrag auf Verlangerung",
      from: "h.schmidt@example.de",
      fromName: "Hans Schmidt",
      snippet: "Sehr geehrte Frau Muller, hiermit teile ich Ihnen mit...",
    }),
    createEmailItemRecord({
      item_id: "email-inbox-2",
      subject: "Einladung: Projektbesprechung",
      from: "sekretariat@bund.de",
      fromName: "Sekretariat",
      snippet: "Hiermit laden wir Sie herzlich ein zur Besprechung am...",
    }),
  ];
  // Re-seed the store with all records including email items
  store.seed(records);
  return records;
}
