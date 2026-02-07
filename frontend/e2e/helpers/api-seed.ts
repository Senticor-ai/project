import type { APIRequestContext } from "@playwright/test";

export class ApiSeed {
  constructor(private request: APIRequestContext) {}

  /** Create an inbox item via API. Returns the thing_id. */
  async createInboxItem(title: string): Promise<string> {
    const id = `urn:gtd:inbox:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const response = await this.request.post("/api/things", {
      data: {
        source: "manual",
        thing: {
          "@id": id,
          "@type": "gtd:InboxItem",
          _schemaVersion: 1,
          title,
          bucket: "inbox",
          rawCapture: title,
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
        },
      },
    });
    const json = await response.json();
    return json.thing_id;
  }

  /** Create an action in a specific bucket via API. Returns the thing_id. */
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
    const id = `urn:gtd:action:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const response = await this.request.post("/api/things", {
      data: {
        source: "manual",
        thing: {
          "@id": id,
          "@type": "gtd:Action",
          _schemaVersion: 1,
          title,
          bucket,
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
          confidence: "high",
          contexts: options?.contexts ?? [],
          isFocused: options?.isFocused ?? false,
          dueDate: options?.dueDate ?? null,
          completedAt: options?.completedAt ?? null,
          projectId: options?.projectId ?? null,
          sequenceOrder: options?.sequenceOrder ?? null,
        },
      },
    });
    const json = await response.json();
    return json.thing_id;
  }

  /** Create a project via API. Returns the canonical ID (urn:gtd:project:...). */
  async createProject(
    title: string,
    desiredOutcome: string,
    options?: { status?: string },
  ): Promise<string> {
    const id = `urn:gtd:project:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const response = await this.request.post("/api/things", {
      data: {
        source: "manual",
        thing: {
          "@id": id,
          "@type": "gtd:Project",
          _schemaVersion: 1,
          title,
          bucket: "project",
          desiredOutcome,
          status: options?.status ?? "active",
          actionIds: [],
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
          confidence: "high",
          isFocused: false,
          reviewDate: null,
          completedAt: null,
        },
      },
    });
    const json = await response.json();
    return id; // Return canonical ID since actions reference projectId
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
