import type { APIRequestContext } from "@playwright/test";

function pv(propertyID: string, value: unknown) {
  return { "@type": "PropertyValue", propertyID, value };
}

export class ApiSeed {
  constructor(private request: APIRequestContext) {}

  /** Create an inbox item via API (v2 schema). Returns the thing_id. */
  async createInboxItem(title: string): Promise<string> {
    const id = `urn:app:inbox:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const response = await this.request.post("/api/things", {
      data: {
        source: "manual",
        thing: {
          "@id": id,
          "@type": "Thing",
          _schemaVersion: 2,
          description: null,
          keywords: [],
          dateCreated: now,
          dateModified: now,
          additionalProperty: [
            pv("app:bucket", "inbox"),
            pv("app:rawCapture", title),
            pv("app:needsEnrichment", true),
            pv("app:confidence", "low"),
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
    return json.thing_id;
  }

  /** Create an action in a specific bucket via API (v2 schema). Returns the thing_id. */
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

    const thing: Record<string, unknown> = {
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
        pv("app:provenanceHistory", [
          { timestamp: now, action: "created" },
        ]),
        ...(options?.sequenceOrder != null
          ? [pv("app:sequenceOrder", options.sequenceOrder)]
          : []),
      ],
    };

    if (options?.projectId) {
      thing.isPartOf = { "@id": options.projectId };
    }

    const response = await this.request.post("/api/things", {
      data: { source: "manual", thing },
    });
    const json = await response.json();
    return json.thing_id;
  }

  /** Create a project via API (v2 schema). Returns the canonical ID (urn:app:project:...). */
  async createProject(
    title: string,
    desiredOutcome: string,
    options?: { status?: string },
  ): Promise<string> {
    const id = `urn:app:project:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await this.request.post("/api/things", {
      data: {
        source: "manual",
        thing: {
          "@id": id,
          "@type": "Project",
          _schemaVersion: 2,
          name: title,
          description: null,
          keywords: [],
          dateCreated: now,
          dateModified: now,
          endTime: null,
          hasPart: [],
          additionalProperty: [
            pv("app:bucket", "project"),
            pv("app:desiredOutcome", desiredOutcome),
            pv("app:projectStatus", options?.status ?? "active"),
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
    return id;
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
}
