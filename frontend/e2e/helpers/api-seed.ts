import type { APIRequestContext } from "@playwright/test";

function pv(propertyID: string, value: unknown) {
  return { "@type": "PropertyValue", propertyID, value };
}

export class ApiSeed {
  constructor(
    private request: APIRequestContext,
    private csrfToken: string = "",
  ) {}

  private headers(): Record<string, string> {
    return this.csrfToken ? { "X-CSRF-Token": this.csrfToken } : {};
  }

  /** Create an inbox item via API (v2 schema). Returns the item_id. */
  async createInboxItem(title: string): Promise<string> {
    const id = `urn:app:inbox:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const response = await this.request.post("/api/items", {
      headers: this.headers(),
      data: {
        source: "manual",
        item: {
          "@id": id,
          "@type": "Action",
          _schemaVersion: 2,
          description: null,
          keywords: [],
          dateCreated: now,
          dateModified: now,
          startTime: null,
          endTime: null,
          additionalProperty: [
            pv("app:bucket", "inbox"),
            pv("app:rawCapture", title),
            pv("app:needsEnrichment", true),
            pv("app:confidence", "medium"),
            pv("app:captureSource", { kind: "thought" }),
            pv("app:contexts", []),
            pv("app:isFocused", false),
            pv("app:ports", []),
            pv("app:typedReferences", []),
            pv("app:provenanceHistory", [
              { timestamp: now, action: "created" },
            ]),
          ],
        },
      },
    });
    const json = await response.json();
    return json.item_id;
  }

  /** Create an action in a specific bucket via API (v2 schema). Returns the item_id. */
  async createAction(
    title: string,
    bucket: "next" | "waiting" | "calendar" | "someday",
    options?: {
      isFocused?: boolean;
      dueDate?: string;
      contexts?: string[];
      projectId?: string;
      sequenceOrder?: number;
      completedAt?: string;
    },
  ): Promise<string> {
    const id = `urn:app:action:${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const itemData: Record<string, unknown> = {
      "@id": id,
      "@type": "Action",
      _schemaVersion: 2,
      description: null,
      keywords: [],
      dateCreated: now,
      dateModified: now,
      startTime: options?.dueDate ?? null,
      endTime: options?.completedAt ?? null,
      additionalProperty: [
        pv("app:bucket", bucket),
        pv("app:rawCapture", title),
        pv("app:needsEnrichment", false),
        pv("app:confidence", "high"),
        pv("app:captureSource", { kind: "thought" }),
        pv("app:contexts", options?.contexts ?? []),
        pv("app:isFocused", options?.isFocused ?? false),
        pv("app:ports", []),
        pv("app:typedReferences", []),
        pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
        ...(options?.sequenceOrder != null
          ? [pv("app:sequenceOrder", options.sequenceOrder)]
          : []),
        pv("app:projectRefs", options?.projectId ? [options.projectId] : []),
      ],
    };

    const response = await this.request.post("/api/items", {
      headers: this.headers(),
      data: { source: "manual", item: itemData },
    });
    const json = await response.json();
    return json.item_id;
  }

  /** Create a calendar event (Event type, calendar bucket). Returns canonical_id. */
  async createCalendarEvent(
    title: string,
    options?: {
      startDate?: string;
      endDate?: string;
      description?: string;
      source?: string;
    },
  ): Promise<string> {
    const id = `urn:app:event:local:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const startDate =
      options?.startDate ??
      new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const endDate =
      options?.endDate ??
      new Date(Date.now() + 90 * 60 * 1000).toISOString();

    const response = await this.request.post("/api/items", {
      headers: this.headers(),
      data: {
        source: options?.source ?? "manual",
        item: {
          "@id": id,
          "@type": "Event",
          _schemaVersion: 2,
          name: title,
          description: options?.description ?? null,
          keywords: ["calendar"],
          dateCreated: now,
          dateModified: now,
          startDate,
          endDate,
          startTime: startDate,
          additionalProperty: [
            pv("app:bucket", "calendar"),
            pv("app:rawCapture", title),
            pv("app:needsEnrichment", false),
            pv("app:confidence", "high"),
            pv("app:captureSource", { kind: "thought" }),
            pv("app:contexts", []),
            pv("app:isFocused", false),
            pv("app:ports", []),
            pv("app:typedReferences", []),
            pv("app:provenanceHistory", [{ timestamp: now, action: "created" }]),
            pv("app:projectRefs", []),
          ],
        },
      },
    });
    const json = await response.json();
    return json.canonical_id;
  }

  /** Create a project via API (v2 schema). Returns the canonical ID (urn:app:project:...). */
  async createProject(
    title: string,
    desiredOutcome: string,
    options?: { status?: string; isFocused?: boolean },
  ): Promise<string> {
    const id = `urn:app:project:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await this.request.post("/api/items", {
      headers: this.headers(),
      data: {
        source: "manual",
        item: {
          "@id": id,
          "@type": "Project",
          _schemaVersion: 2,
          name: title,
          description: null,
          keywords: [],
          dateCreated: now,
          dateModified: now,
          additionalProperty: [
            pv("app:bucket", "project"),
            pv("app:desiredOutcome", desiredOutcome),
            pv("app:projectStatus", options?.status ?? "active"),
            pv("app:captureSource", { kind: "thought" }),
            pv("app:contexts", []),
            pv("app:isFocused", options?.isFocused ?? false),
            pv("app:ports", []),
            pv("app:typedReferences", []),
            pv("app:provenanceHistory", [
              { timestamp: now, action: "created" },
            ]),
          ],
        },
      },
    });
    return id;
  }

  /** Create an email inbox item via API (EmailMessage type). Returns the item_id. */
  async createEmailInboxItem(
    subject: string,
    options?: {
      from?: string;
      fromName?: string;
      htmlBody?: string;
      sourceUrl?: string;
    },
  ): Promise<string> {
    const id = `urn:app:email:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const senderEmail = options?.from ?? "sender@example.de";
    const senderName = options?.fromName ?? "Test Sender";
    const htmlBody = options?.htmlBody ?? `<p>${subject}</p>`;

    const response = await this.request.post("/api/items", {
      headers: this.headers(),
      data: {
        source: "gmail",
        item: {
          "@id": id,
          "@type": "EmailMessage",
          _schemaVersion: 2,
          name: subject,
          description: null,
          keywords: [],
          dateCreated: now,
          dateModified: now,
          startTime: null,
          endTime: null,
          sender: {
            "@type": "Person",
            email: senderEmail,
            name: senderName,
          },
          additionalProperty: [
            pv("app:bucket", "inbox"),
            pv("app:rawCapture", subject),
            pv("app:needsEnrichment", true),
            pv("app:confidence", "medium"),
            pv("app:captureSource", {
              kind: "email",
              subject,
              from: senderEmail,
            }),
            pv("app:emailBody", htmlBody),
            ...(options?.sourceUrl
              ? [pv("app:emailSourceUrl", options.sourceUrl)]
              : []),
            pv("app:contexts", []),
            pv("app:isFocused", false),
            pv("app:ports", []),
            pv("app:typedReferences", []),
            pv("app:provenanceHistory", [
              { timestamp: now, action: "created" },
            ]),
          ],
        },
      },
    });
    const json = await response.json();
    return json.item_id;
  }

  /** Create a DigitalDocument inbox item via API (simulates file drop). Returns the item_id. */
  async createDigitalDocumentInboxItem(
    name: string,
    options?: { encodingFormat?: string; projectId?: string },
  ): Promise<string> {
    const id = `urn:app:inbox:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const encodingFormat = options?.encodingFormat ?? "application/pdf";

    const response = await this.request.post("/api/items", {
      headers: this.headers(),
      data: {
        source: "manual",
        item: {
          "@id": id,
          "@type": "DigitalDocument",
          _schemaVersion: 2,
          name,
          description: null,
          keywords: [],
          encodingFormat,
          dateCreated: now,
          dateModified: now,
          additionalProperty: [
            pv("app:bucket", "inbox"),
            pv("app:needsEnrichment", true),
            pv("app:confidence", "medium"),
            pv("app:captureSource", {
              kind: "file",
              fileName: name,
              mimeType: encodingFormat,
            }),
            pv("app:contexts", []),
            pv("app:isFocused", false),
            pv("app:ports", []),
            pv("app:typedReferences", []),
            pv("app:provenanceHistory", [
              { timestamp: now, action: "created" },
            ]),
            pv(
              "app:projectRefs",
              options?.projectId ? [options.projectId] : [],
            ),
          ],
        },
      },
    });
    const json = await response.json();
    return json.item_id;
  }

  /** Create a reference item via API (CreativeWork or DigitalDocument). Returns the canonical ID. */
  async createReference(
    name: string,
    options?: {
      type?: "CreativeWork" | "DigitalDocument";
      encodingFormat?: string;
      origin?: string;
      projectId?: string;
    },
  ): Promise<string> {
    const id = `urn:app:reference:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const type = options?.type ?? "CreativeWork";

    const response = await this.request.post("/api/items", {
      headers: this.headers(),
      data: {
        source: "manual",
        item: {
          "@id": id,
          "@type": type,
          _schemaVersion: 2,
          name,
          description: null,
          keywords: [],
          ...(options?.encodingFormat
            ? { encodingFormat: options.encodingFormat }
            : {}),
          dateCreated: now,
          dateModified: now,
          additionalProperty: [
            pv("app:bucket", "reference"),
            pv("app:needsEnrichment", false),
            pv("app:confidence", "high"),
            pv("app:captureSource", { kind: "thought" }),
            pv("app:origin", options?.origin ?? "captured"),
            pv("app:ports", []),
            pv("app:typedReferences", []),
            pv("app:provenanceHistory", [
              { timestamp: now, action: "created" },
            ]),
            pv(
              "app:projectRefs",
              options?.projectId ? [options.projectId] : [],
            ),
          ],
        },
      },
    });
    const json = await response.json();
    return json.canonical_id;
  }

  /** Create multiple inbox items sequentially (ensures FIFO order by createdAt). */
  async createInboxItems(titles: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const title of titles) {
      ids.push(await this.createInboxItem(title));
      // Small delay to ensure distinct timestamps for FIFO ordering
      await new Promise((r) => setTimeout(r, 50));
    }
    return ids;
  }

  async sendNotification(payload: {
    kind?: string;
    title: string;
    body: string;
    url?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<{ event_id: string }> {
    const response = await this.request.post("/api/notifications/send", {
      headers: this.headers(),
      data: payload,
    });
    return response.json();
  }
}
