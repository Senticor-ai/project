import type {
  ItemRecord,
  SyncResponse,
  FileRecord,
  EmailConnectionResponse,
  EmailConnectionCalendarResponse,
  OrgResponse,
} from "@/lib/api-client";
import type { CanonicalId } from "@/model/canonical-id";
import type { ConversationSummary } from "@/model/chat-types";

// ---------------------------------------------------------------------------
// In-memory store — shared between handlers and story setup
// ---------------------------------------------------------------------------

export const store = {
  items: new Map<string, ItemRecord>(),
  fileContent: new Map<string, string>(),
  emailConnections: new Map<string, EmailConnectionResponse>(),
  emailCalendars: new Map<string, EmailConnectionCalendarResponse[]>(),
  orgs: new Map<string, OrgResponse>(),
  conversations: new Map<string, ConversationSummary>(),
  clear() {
    this.items.clear();
    this.fileContent.clear();
    this.emailConnections.clear();
    this.emailCalendars.clear();
    this.orgs.clear();
    this.conversations.clear();
  },
  seed(records: ItemRecord[]) {
    this.items.clear();
    for (const r of records) this.items.set(r.item_id, r);
  },
  seedOrgs(orgs: OrgResponse[]) {
    this.orgs.clear();
    for (const o of orgs) this.orgs.set(o.id, o);
  },
  seedConversations(conversations: ConversationSummary[]) {
    this.conversations.clear();
    for (const c of conversations) this.conversations.set(c.conversationId, c);
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

// Action subtypes recognized by the serializer (schema.org types)
const ACTION_SUBTYPES = new Set([
  "Action",
  "ReadAction",
  "PlanAction",
  "BuyAction",
  "CommunicateAction",
  "ReviewAction",
  "CreateAction",
  "SendAction",
  "CheckAction",
]);

let counter = 0;

export function createItemRecord(
  overrides: Partial<ItemRecord> & {
    bucket?: string;
    /** Schema.org type - can be Action subtypes like BuyAction, CreateAction, etc. */
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
    /** For ReadAction: canonical ID of the referenced item. */
    objectRef?: string;
    tags?: string[];
  } = {},
): ItemRecord {
  counter++;
  const id = overrides.item_id ?? `item-${counter}`;
  const now = new Date().toISOString();
  const bucket = overrides.bucket ?? "inbox";
  const type =
    overrides.type ??
    (overrides.objectRef
      ? "ReadAction"
      : bucket === "project"
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
    keywords: overrides.tags ?? [],
    dateCreated: now,
    dateModified: now,
  };

  if (ACTION_SUBTYPES.has(type)) {
    base.startTime = null;
    base.endTime = overrides.completedAt ?? null;
    if (overrides.objectRef) {
      base.object = { "@id": overrides.objectRef };
    }
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
      pv("app:projectRefs", overrides.projectId ? [overrides.projectId] : []),
    ];
  } else if (
    (type === "DigitalDocument" || type === "EmailMessage") &&
    bucket === "reference"
  ) {
    // DigitalDocument in reference bucket (e.g. from split-on-triage)
    base.name = overrides.name ?? displayName;
    base.encodingFormat = overrides.encodingFormat ?? null;
    base.additionalProperty = [
      pv("app:bucket", "reference"),
      pv("app:needsEnrichment", false),
      pv("app:confidence", "high"),
      pv(
        "app:captureSource",
        type === "EmailMessage"
          ? { kind: "email" }
          : {
              kind: "file",
              fileName: displayName,
              mimeType: overrides.encodingFormat ?? "application/pdf",
            },
      ),
      pv("app:origin", overrides.origin ?? "triaged"),
      pv("app:ports", []),
      pv("app:typedReferences", []),
      pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
      pv("app:projectRefs", overrides.projectId ? [overrides.projectId] : []),
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
      item_id: "inbox-buy-1",
      bucket: "inbox",
      type: "BuyAction",
      name: "Äpfel kaufen",
    }),
    createItemRecord({
      item_id: "inbox-buy-2",
      bucket: "inbox",
      type: "BuyAction",
      name: "Blumen kaufen",
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

export function seedActionSubtypes(): ItemRecord[] {
  const refCanonicalId = "urn:app:reference:action-ref-1" as CanonicalId;
  const records = [
    // Generic Action
    createItemRecord({
      item_id: "action-generic",
      bucket: "next",
      type: "Action",
      name: "Complete task",
    }),
    // ReadAction with reference
    createItemRecord({
      item_id: "action-read",
      bucket: "next",
      type: "ReadAction",
      name: "Review specification document",
      objectRef: refCanonicalId,
    }),
    // PlanAction
    createItemRecord({
      item_id: "action-plan",
      bucket: "next",
      type: "PlanAction",
      name: "Plan Q2 roadmap",
    }),
    // BuyAction
    createItemRecord({
      item_id: "action-buy",
      bucket: "next",
      type: "BuyAction",
      name: "Order office supplies",
    }),
    // CommunicateAction
    createItemRecord({
      item_id: "action-communicate",
      bucket: "next",
      type: "CommunicateAction",
      name: "Call vendor about contract",
    }),
    // ReviewAction
    createItemRecord({
      item_id: "action-review",
      bucket: "next",
      type: "ReviewAction",
      name: "Review team deliverables",
    }),
    // CreateAction
    createItemRecord({
      item_id: "action-create",
      bucket: "next",
      type: "CreateAction",
      name: "Draft presentation slides",
    }),
    // SendAction
    createItemRecord({
      item_id: "action-send",
      bucket: "next",
      type: "SendAction",
      name: "Send quarterly report to board",
    }),
    // CheckAction
    createItemRecord({
      item_id: "action-check",
      bucket: "next",
      type: "CheckAction",
      name: "Verify invoice details",
    }),
    // Reference item for ReadAction
    createItemRecord({
      item_id: "action-ref-1",
      canonical_id: refCanonicalId,
      bucket: "reference",
      type: "DigitalDocument",
      name: "Specification.pdf",
      encodingFormat: "application/pdf",
      origin: "triaged",
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
    calendar_sync_enabled: true,
    calendar_selected_ids: ["primary"],
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

export function seedReadActionSplit(): ItemRecord[] {
  const refCanonicalId = "urn:app:reference:split-ref-1" as CanonicalId;
  const records = [
    ...seedMixedBuckets(),
    // ReadAction in "next" bucket — linked to the reference
    createItemRecord({
      item_id: "read-action-1",
      bucket: "next",
      name: "BSI-TR-03183-2.pdf",
      objectRef: refCanonicalId,
      type: "ReadAction",
    }),
    // DigitalDocument in "reference" bucket — the split artifact
    createItemRecord({
      item_id: "split-ref-1",
      canonical_id: refCanonicalId,
      bucket: "reference",
      type: "DigitalDocument",
      name: "BSI-TR-03183-2.pdf",
      encodingFormat: "application/pdf",
      origin: "triaged",
      fileId: "file-bsi-1",
      downloadUrl: "/files/file-bsi-1",
    }),
  ];
  store.seed(records);
  return records;
}

export function seedProjectWithReferences(): ItemRecord[] {
  const projectCanonicalId = "urn:app:project:project-tax" as CanonicalId;
  const records = [
    ...seedMixedBuckets(),
    // Tax Return project
    createItemRecord({
      item_id: "project-tax",
      canonical_id: projectCanonicalId,
      bucket: "project",
      name: "Steuererklärung 2025",
      desiredOutcome: "CPA Übergabe komplett",
    }),
    // Action linked to project
    createItemRecord({
      item_id: "tax-action-1",
      bucket: "next",
      name: "Belege sortieren",
      projectId: projectCanonicalId,
    }),
    // References linked to project
    createItemRecord({
      item_id: "tax-ref-w2",
      bucket: "reference",
      type: "DigitalDocument",
      name: "W-2 Form.pdf",
      encodingFormat: "application/pdf",
      origin: "triaged",
      projectId: projectCanonicalId,
    }),
    createItemRecord({
      item_id: "tax-ref-1099",
      bucket: "reference",
      type: "CreativeWork",
      name: "1099-INT Schwab.pdf",
      origin: "captured",
      projectId: projectCanonicalId,
    }),
    // Unlinked reference (no project)
    createItemRecord({
      item_id: "ref-unlinked",
      bucket: "reference",
      type: "CreativeWork",
      name: "General notes",
      origin: "captured",
    }),
  ];
  store.seed(records);
  return records;
}

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

// ---------------------------------------------------------------------------
// Organization fixtures
// ---------------------------------------------------------------------------

let orgCounter = 0;

export function createOrgResponse(
  overrides: Partial<OrgResponse> & { name: string },
): OrgResponse {
  orgCounter++;
  return {
    id: overrides.id ?? `org-${orgCounter}`,
    name: overrides.name,
    role: overrides.role ?? "owner",
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

export function seedDefaultOrgs(): OrgResponse[] {
  const orgs = [
    createOrgResponse({ id: "org-personal", name: "Wolfgang's Workspace" }),
    createOrgResponse({ id: "org-nueva-tierra", name: "Nueva Tierra" }),
    createOrgResponse({
      id: "org-autonomo",
      name: "Autonomo Wolfgang Ihloff",
    }),
  ];
  store.seedOrgs(orgs);
  return orgs;
}

// ---------------------------------------------------------------------------
// Person item fixtures
// ---------------------------------------------------------------------------

export function createPersonItemRecord(overrides: {
  item_id?: string;
  name: string;
  email?: string;
  telephone?: string;
  jobTitle?: string;
  orgRole?: string;
  orgRef?: { id: string; name: string };
}): ItemRecord {
  counter++;
  const id = overrides.item_id ?? `person-${counter}`;
  const now = new Date().toISOString();
  const canonicalId = `urn:app:reference:${id}` as CanonicalId;

  const additionalProperty = [
    pv("app:bucket", "reference"),
    pv("app:needsEnrichment", false),
    pv("app:confidence", "high"),
    pv("app:captureSource", { kind: "thought" }),
    pv("app:ports", []),
    pv("app:typedReferences", []),
    pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
    pv("app:projectRefs", []),
  ];
  if (overrides.orgRef) {
    additionalProperty.push(pv("app:orgRef", JSON.stringify(overrides.orgRef)));
  }
  if (overrides.orgRole) {
    additionalProperty.push(pv("app:orgRole", overrides.orgRole));
  }

  return {
    item_id: id,
    canonical_id: canonicalId,
    source: "manual",
    item: {
      "@id": canonicalId,
      "@type": "Person",
      _schemaVersion: 2,
      name: overrides.name,
      email: overrides.email ?? null,
      telephone: overrides.telephone ?? null,
      jobTitle: overrides.jobTitle ?? null,
      description: null,
      keywords: [],
      dateCreated: now,
      dateModified: now,
      additionalProperty,
    },
    created_at: now,
    updated_at: now,
  };
}

// ---------------------------------------------------------------------------
// Org doc item fixtures
// ---------------------------------------------------------------------------

export function createOrgDocItemRecord(overrides: {
  item_id?: string;
  name: string;
  orgDocType: "general" | "user" | "log" | "agent";
  orgRef?: { id: string; name: string };
  initialContent?: string;
}): ItemRecord {
  counter++;
  const id = overrides.item_id ?? `orgdoc-${counter}`;
  const now = new Date().toISOString();
  const canonicalId = `urn:app:reference:${id}` as CanonicalId;
  const content = overrides.initialContent ?? "";

  if (content) {
    store.fileContent.set(id, content);
  }

  const additionalProperty = [
    pv("app:bucket", "reference"),
    pv("app:orgDocType", overrides.orgDocType),
    pv("app:needsEnrichment", false),
    pv("app:confidence", "high"),
    pv("app:captureSource", { kind: "system" }),
    pv("app:ports", []),
    pv("app:typedReferences", []),
    pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
    pv("app:projectRefs", []),
  ];
  if (overrides.orgRef) {
    additionalProperty.push(pv("app:orgRef", JSON.stringify(overrides.orgRef)));
  }

  return {
    item_id: id,
    canonical_id: canonicalId,
    source: "system",
    item: {
      "@id": canonicalId,
      "@type": "DigitalDocument",
      _schemaVersion: 2,
      name: overrides.name,
      encodingFormat: "text/markdown",
      text: content,
      description: null,
      keywords: [],
      dateCreated: now,
      dateModified: now,
      additionalProperty,
    },
    created_at: now,
    updated_at: now,
  };
}
