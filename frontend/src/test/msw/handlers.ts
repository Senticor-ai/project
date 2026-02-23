import { http, HttpResponse } from "msw";
import {
  store,
  buildSyncResponse,
  createFileRecord,
  createEmailConnection,
  createItemRecord,
  createOrgResponse,
} from "./fixtures";
import type {
  ItemRecord,
  ImportSummary,
  ImportJobResponse,
  EmailConnectionResponse,
  EmailConnectionUpdateRequest,
  OrgResponse,
} from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Wildcard prefix matches any origin (e.g. http://localhost:8000/items/sync).
// API paths in api-client.ts are /items/sync, /auth/me, etc. (no /api prefix).
const API = "*";

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (key === "additionalProperty" && Array.isArray(source[key])) {
      // Merge additionalProperty: patch values overwrite matching propertyIDs
      const existing =
        (target[key] as Array<{ propertyID: string; value: unknown }>) ?? [];
      const patches = source[key] as Array<{
        propertyID: string;
        value: unknown;
      }>;
      const patched = existing.map((p) => {
        const override = patches.find((s) => s.propertyID === p.propertyID);
        return override ? { ...p, value: override.value } : p;
      });
      // Add new properties not in existing
      for (const p of patches) {
        if (!existing.some((e) => e.propertyID === p.propertyID)) {
          patched.push(p);
        }
      }
      result[key] = patched;
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Items API handlers
// ---------------------------------------------------------------------------

export const itemsHandlers = [
  // Sync endpoint — used by useItems / useAllItems
  http.get(`${API}/items/sync`, ({ request }) => {
    const url = new URL(request.url);
    const completed = url.searchParams.get("completed") ?? "false";
    const all = Array.from(store.items.values());

    const filtered = all.filter((r) => {
      const hasEndTime = !!r.item.endTime;
      return completed === "true" ? hasEndTime : !hasEndTime;
    });

    return HttpResponse.json(buildSyncResponse(filtered));
  }),

  // Create item — used by useCaptureInbox, useAddAction, useAddReference
  http.post(`${API}/items`, async ({ request }) => {
    const body = (await request.json()) as {
      item: Record<string, unknown>;
      source: string;
    };
    const itemId = `msw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const canonicalId =
      (body.item["@id"] as string) ?? `urn:app:inbox:${itemId}`;

    const record: ItemRecord = {
      item_id: itemId,
      canonical_id: canonicalId,
      source: body.source,
      item: body.item,
      created_at: now,
      updated_at: now,
    };
    store.items.set(itemId, record);
    return HttpResponse.json(record, { status: 201 });
  }),

  // Update item — used by useMoveAction, useToggleFocus, useUpdateItem, useTriageItem, useCompleteAction
  http.patch(`${API}/items/:itemId`, async ({ params, request }) => {
    const itemId = params.itemId as string;
    const body = (await request.json()) as { item: Record<string, unknown> };
    const existing = store.items.get(itemId);

    if (!existing) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }

    const merged = deepMerge(existing.item, body.item);
    const updated: ItemRecord = {
      ...existing,
      item: merged,
      updated_at: new Date().toISOString(),
    };
    store.items.set(itemId, updated);
    return HttpResponse.json(updated);
  }),

  // Archive item — used by useArchiveReference
  http.delete(`${API}/items/:itemId`, ({ params }) => {
    const itemId = params.itemId as string;
    const existing = store.items.get(itemId);

    if (!existing) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }

    store.items.delete(itemId);
    return HttpResponse.json({
      item_id: itemId,
      archived_at: new Date().toISOString(),
      ok: true,
    });
  }),
];

// ---------------------------------------------------------------------------
// Files API handlers (chunked upload)
// ---------------------------------------------------------------------------

export const filesHandlers = [
  http.post(`${API}/files/initiate`, () => {
    return HttpResponse.json({
      upload_id: "msw-upload-1",
      upload_url: `${API}/files/upload/msw-upload-1`,
      chunk_size: 1_000_000,
      chunk_total: 1,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
  }),

  http.put(`${API}/files/upload/:uploadId`, () => {
    return HttpResponse.json({ received: 12345 });
  }),

  http.post(`${API}/files/complete`, () => {
    return HttpResponse.json(createFileRecord());
  }),
];

// ---------------------------------------------------------------------------
// Imports API handlers
// ---------------------------------------------------------------------------

const defaultImportSummary: ImportSummary = {
  total: 42,
  created: 35,
  updated: 3,
  skipped: 2,
  errors: 2,
  bucket_counts: { inbox: 10, next: 15, waiting: 5, someday: 7, reference: 5 },
  sample_errors: ["item[17] missing name"],
};

let importJobState: ImportJobResponse | null = null;

export const importsHandlers = [
  http.post(`${API}/imports/nirvana/inspect`, () => {
    return HttpResponse.json(defaultImportSummary);
  }),

  http.post(`${API}/imports/nirvana/from-file`, () => {
    const now = new Date().toISOString();
    importJobState = {
      job_id: "msw-job-1",
      status: "completed",
      file_id: "file-msw-1",
      file_sha256: "abc123def456",
      source: "nirvana",
      created_at: now,
      updated_at: now,
      started_at: now,
      finished_at: now,
      summary: defaultImportSummary,
      progress: null,
      error: null,
      archived_at: null,
    };
    return HttpResponse.json(importJobState);
  }),

  http.post(`${API}/imports/native/inspect`, () => {
    return HttpResponse.json(defaultImportSummary);
  }),

  http.post(`${API}/imports/native/from-file`, () => {
    const now = new Date().toISOString();
    importJobState = {
      job_id: "msw-job-2",
      status: "completed",
      file_id: "file-msw-2",
      file_sha256: "def456abc789",
      source: "native",
      created_at: now,
      updated_at: now,
      started_at: now,
      finished_at: now,
      summary: defaultImportSummary,
      progress: null,
      error: null,
      archived_at: null,
    };
    return HttpResponse.json(importJobState);
  }),

  http.get(`${API}/imports/jobs/:jobId`, () => {
    if (!importJobState) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }
    return HttpResponse.json(importJobState);
  }),

  http.get(`${API}/imports/jobs`, () => {
    return HttpResponse.json(importJobState ? [importJobState] : []);
  }),

  http.post(`${API}/imports/jobs/:jobId/retry`, () => {
    const now = new Date().toISOString();
    importJobState = {
      job_id: "msw-job-retry",
      status: "queued",
      file_id: importJobState?.file_id ?? "file-msw-1",
      file_sha256: importJobState?.file_sha256 ?? "abc123def456",
      source: importJobState?.source ?? "nirvana",
      created_at: now,
      updated_at: now,
      started_at: null,
      finished_at: null,
      summary: null,
      progress: null,
      error: null,
      archived_at: null,
    };
    return HttpResponse.json(importJobState, { status: 202 });
  }),

  http.post(`${API}/imports/jobs/:jobId/archive`, () => {
    if (importJobState) {
      importJobState = {
        ...importJobState,
        archived_at: new Date().toISOString(),
      };
    }
    return HttpResponse.json(importJobState);
  }),
];

// ---------------------------------------------------------------------------
// Auth handlers (minimal stubs)
// ---------------------------------------------------------------------------

export const authHandlers = [
  http.get(`${API}/auth/me`, () => {
    return HttpResponse.json({
      id: "user-1",
      email: "storybook@test.local",
      username: "storybook",
      created_at: "2026-01-01T00:00:00Z",
    });
  }),

  http.get(`${API}/auth/csrf`, () => {
    return HttpResponse.json({ csrf_token: "msw-csrf-token" });
  }),
];

// ---------------------------------------------------------------------------
// Email API handlers
// ---------------------------------------------------------------------------

export const emailHandlers = [
  http.get(`${API}/email/connections`, () => {
    const connections = Array.from(store.emailConnections.values()).filter(
      (c) => c.is_active,
    );
    return HttpResponse.json(connections);
  }),

  http.get(`${API}/email/oauth/gmail/authorize`, () => {
    return HttpResponse.json({
      url: "https://accounts.google.com/o/oauth2/v2/auth?mock=true",
    });
  }),

  http.patch(`${API}/email/connections/:id`, async ({ params, request }) => {
    const id = params.id as string;
    const patch = (await request.json()) as EmailConnectionUpdateRequest;
    const existing = store.emailConnections.get(id);
    if (!existing) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }
    const updated: EmailConnectionResponse = {
      ...existing,
      ...(patch.sync_interval_minutes !== undefined && {
        sync_interval_minutes: patch.sync_interval_minutes,
      }),
      ...(patch.sync_mark_read !== undefined && {
        sync_mark_read: patch.sync_mark_read,
      }),
    };
    store.emailConnections.set(id, updated);
    return HttpResponse.json(updated);
  }),

  http.post(`${API}/email/connections/:id/sync`, ({ params }) => {
    const id = params.id as string;
    const existing = store.emailConnections.get(id);
    if (!existing) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }
    store.emailConnections.set(id, {
      ...existing,
      last_sync_at: new Date().toISOString(),
      last_sync_message_count: (existing.last_sync_message_count ?? 0) + 3,
    });
    return HttpResponse.json({
      synced: 3,
      created: 2,
      skipped: 1,
      errors: 0,
    });
  }),

  http.delete(`${API}/email/connections/:id`, ({ params }) => {
    const id = params.id as string;
    const existing = store.emailConnections.get(id);
    if (!existing) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }
    const archived: EmailConnectionResponse = {
      ...existing,
      is_active: false,
    };
    store.emailConnections.set(id, archived);
    return HttpResponse.json(archived);
  }),
];

// ---------------------------------------------------------------------------
// Email store seed helper
// ---------------------------------------------------------------------------

export function seedEmailConnection(
  overrides?: Partial<EmailConnectionResponse>,
) {
  const conn = createEmailConnection(overrides);
  store.emailConnections.set(conn.connection_id, conn);
  return conn;
}

// ---------------------------------------------------------------------------
// Chat handlers (Tay Copilot V1)
// ---------------------------------------------------------------------------

const chatHandlers = [
  http.post(`${API}/chat/completions`, async ({ request }) => {
    const body = (await request.json()) as { message: string };
    const msg = body.message.toLowerCase();

    // Birthday scenario — project with actions (NDJSON stream)
    if (
      msg.includes("geburtstag") ||
      msg.includes("birthday") ||
      msg.includes("party") ||
      msg.includes("feier")
    ) {
      const text = "Klingt nach einem Projekt! Hier ist mein Vorschlag:";
      const events = [
        { type: "text_delta", content: text },
        {
          type: "tool_calls",
          toolCalls: [
            {
              name: "create_project_with_actions",
              arguments: {
                type: "create_project_with_actions",
                project: {
                  name: "Geburtstagsfeier planen",
                  desiredOutcome: "Erfolgreiche Geburtstagsfeier",
                },
                actions: [
                  { name: "Gästeliste erstellen", bucket: "next" },
                  { name: "Einladungen versenden", bucket: "next" },
                  { name: "Location buchen", bucket: "next" },
                  { name: "Essen & Getränke organisieren", bucket: "next" },
                  { name: "Dekoration besorgen", bucket: "next" },
                ],
                documents: [{ name: "Einladungsvorlage" }],
              },
            },
          ],
        },
        { type: "done", text },
      ];
      const ndjson = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
      return new HttpResponse(ndjson, {
        headers: { "Content-Type": "application/x-ndjson" },
      });
    }

    // Simple text response for greetings (NDJSON stream)
    const text =
      "Hallo! Ich bin Copilot, dein Assistent. Wie kann ich dir helfen?";
    const events = [
      { type: "text_delta", content: text },
      { type: "done", text },
    ];
    const ndjson = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    return new HttpResponse(ndjson, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }),

  http.post(`${API}/chat/execute-tool`, async ({ request }) => {
    const body = (await request.json()) as {
      toolCall: { name: string; arguments: Record<string, unknown> };
      conversationId: string;
    };

    const createdItems: Array<{
      canonicalId: string;
      name: string;
      type: string;
    }> = [];

    const args = body.toolCall.arguments;
    const ts = Date.now();

    switch (body.toolCall.name) {
      case "create_project_with_actions": {
        const project = args.project as {
          name: string;
          desiredOutcome: string;
        };
        const projectId = `urn:app:project:msw-${ts}`;
        createdItems.push({
          canonicalId: projectId,
          name: project.name,
          type: "project",
        });
        // Persist in store so stories can verify
        const projRecord = createItemRecord({
          item_id: `msw-${ts}`,
          bucket: "project",
          name: project.name,
          desiredOutcome: project.desiredOutcome,
        });
        store.items.set(projRecord.item_id, projRecord);

        const actions =
          (args.actions as Array<{ name: string; bucket: string }>) ?? [];
        for (const [i, action] of actions.entries()) {
          createdItems.push({
            canonicalId: `urn:app:action:msw-${ts}-${i}`,
            name: action.name,
            type: "action",
          });
          const actionRecord = createItemRecord({
            item_id: `msw-${ts}-${i}`,
            bucket: action.bucket || "next",
            name: action.name,
            projectId: projectId as import("@/model/canonical-id").CanonicalId,
          });
          store.items.set(actionRecord.item_id, actionRecord);
        }

        const docs = (args.documents as Array<{ name: string }>) ?? [];
        for (const [i, doc] of docs.entries()) {
          createdItems.push({
            canonicalId: `urn:app:reference:msw-${ts}-${i}`,
            name: doc.name,
            type: "reference",
          });
          const refRecord = createItemRecord({
            item_id: `msw-ref-${ts}-${i}`,
            bucket: "reference",
            type: "CreativeWork",
            name: doc.name,
          });
          store.items.set(refRecord.item_id, refRecord);
        }
        break;
      }
      case "create_action": {
        createdItems.push({
          canonicalId: `urn:app:action:msw-${ts}`,
          name: args.name as string,
          type: "action",
        });
        const actionRecord = createItemRecord({
          item_id: `msw-${ts}`,
          bucket: (args.bucket as string) || "next",
          name: args.name as string,
        });
        store.items.set(actionRecord.item_id, actionRecord);
        break;
      }
      case "create_reference": {
        createdItems.push({
          canonicalId: `urn:app:reference:msw-${ts}`,
          name: args.name as string,
          type: "reference",
        });
        const refRecord = createItemRecord({
          item_id: `msw-${ts}`,
          bucket: "reference",
          type: "CreativeWork",
          name: args.name as string,
        });
        store.items.set(refRecord.item_id, refRecord);
        break;
      }
      case "render_cv": {
        const pdfName = (args.filename as string) || "rendered.pdf";
        createdItems.push({
          canonicalId: `urn:app:reference:msw-pdf-${ts}`,
          name: pdfName,
          type: "reference",
        });
        const pdfRecord = createItemRecord({
          item_id: `msw-pdf-${ts}`,
          bucket: "reference",
          type: "CreativeWork",
          name: pdfName,
        });
        store.items.set(pdfRecord.item_id, pdfRecord);
        break;
      }
    }

    return HttpResponse.json({ createdItems });
  }),
];

// ---------------------------------------------------------------------------
// Conversation management handlers
// ---------------------------------------------------------------------------

const conversationHandlers = [
  http.get(`${API}/chat/conversations`, () => {
    const conversations = Array.from(store.conversations.values());
    conversations.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return HttpResponse.json(conversations);
  }),

  http.get(`${API}/chat/conversations/:conversationId/messages`, () => {
    // Return a simple history for any requested conversation
    return HttpResponse.json([
      {
        messageId: "msg-1",
        role: "user",
        content: "Hallo Copilot",
        createdAt: new Date().toISOString(),
      },
      {
        messageId: "msg-2",
        role: "assistant",
        content: "Hallo! Wie kann ich dir helfen?",
        createdAt: new Date().toISOString(),
      },
    ]);
  }),

  http.patch(
    `${API}/chat/conversations/:conversationId/archive`,
    ({ params }) => {
      const id = params.conversationId as string;
      store.conversations.delete(id);
      return new HttpResponse(null, { status: 204 });
    },
  ),
];

// ---------------------------------------------------------------------------
// Organizations handlers
// ---------------------------------------------------------------------------

const orgsHandlers = [
  http.get("*/orgs", () => {
    const orgs = Array.from(store.orgs.values());
    return HttpResponse.json(orgs);
  }),

  http.post("*/orgs", async ({ request }) => {
    const body = (await request.json()) as { name: string };
    const org: OrgResponse = createOrgResponse({ name: body.name });
    store.orgs.set(org.id, org);
    return HttpResponse.json(org, { status: 201 });
  }),
];

// ---------------------------------------------------------------------------
// Combined handler set
// ---------------------------------------------------------------------------

export const handlers = [
  ...itemsHandlers,
  ...filesHandlers,
  ...importsHandlers,
  ...authHandlers,
  ...emailHandlers,
  ...chatHandlers,
  ...conversationHandlers,
  ...orgsHandlers,
];
