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
  CalendarEventDeleteResponse,
  CalendarEventResponse,
  ItemRecord,
  ImportSummary,
  ImportJobResponse,
  EmailConnectionResponse,
  EmailConnectionUpdateRequest,
  EmailProposalResponse,
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

function getBucket(item: Record<string, unknown>): string | null {
  const props = item.additionalProperty as
    | Array<{ propertyID?: string; value?: unknown }>
    | undefined;
  if (!Array.isArray(props)) return null;
  const bucket = props.find((entry) => entry.propertyID === "app:bucket");
  return typeof bucket?.value === "string" ? bucket.value : null;
}

function getAdditionalValue(
  item: Record<string, unknown>,
  propertyID: string,
): unknown {
  const props = item.additionalProperty as
    | Array<{ propertyID?: string; value?: unknown }>
    | undefined;
  if (!Array.isArray(props)) return null;
  return props.find((entry) => entry.propertyID === propertyID)?.value;
}

function itemToCalendarEvent(record: ItemRecord): CalendarEventResponse {
  const item = record.item as Record<string, unknown>;
  const sourceMetadata =
    (item.sourceMetadata as
      | { provider?: string; raw?: { calendarId?: string; eventId?: string } }
      | undefined) ?? undefined;
  const provider =
    typeof sourceMetadata?.provider === "string"
      ? sourceMetadata.provider
      : null;
  return {
    item_id: record.item_id,
    canonical_id: record.canonical_id,
    name: (item.name as string) ?? "(Untitled)",
    description: (item.description as string) ?? null,
    start_date:
      (item.startDate as string) ?? (item.startTime as string) ?? null,
    end_date: (item.endDate as string) ?? null,
    source: record.source,
    provider,
    calendar_id: sourceMetadata?.raw?.calendarId ?? null,
    event_id: sourceMetadata?.raw?.eventId ?? null,
    access_role: provider === "google_calendar" ? "owner" : null,
    writable: true,
    rsvp_status:
      (getAdditionalValue(item, "app:rsvpStatus") as
        | "accepted"
        | "tentative"
        | "declined"
        | null) ?? null,
    sync_state: provider === "google_calendar" ? "Synced" : "Local only",
    updated_at: record.updated_at,
  };
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

  // Get item content — used by OrgDocEditor via useQuery
  http.get(`${API}/items/:itemId/content`, ({ params }) => {
    const itemId = params.itemId as string;
    // Look up by direct key first, then by canonical_id
    let content = store.fileContent.get(itemId);
    if (content === undefined) {
      const record = Array.from(store.items.values()).find(
        (r) => r.canonical_id === itemId,
      );
      if (record) {
        const text = (record.item as Record<string, unknown>).text;
        content = typeof text === "string" ? text : "";
      }
    }
    return HttpResponse.json({
      item_id: itemId,
      canonical_id: itemId,
      name: null,
      description: null,
      type: "DigitalDocument",
      bucket: "reference",
      file_content: content ?? null,
      file_name: null,
    });
  }),

  // Patch file content — used by usePatchFileContent
  http.patch(
    `${API}/items/:itemId/file-content`,
    async ({ params, request }) => {
      const itemId = params.itemId as string;
      const body = (await request.json()) as { text: string };
      store.fileContent.set(itemId, body.text);
      // Also update item.text if present in the store
      const record =
        store.items.get(itemId) ??
        Array.from(store.items.values()).find((r) => r.canonical_id === itemId);
      if (record) {
        const updatedItem: ItemRecord = {
          ...record,
          item: {
            ...(record.item as Record<string, unknown>),
            text: body.text,
          },
          updated_at: new Date().toISOString(),
        };
        store.items.set(record.item_id, updatedItem);
      }
      return HttpResponse.json({ ok: true });
    },
  ),

  // Append content — used by useAppendContent
  http.post(
    `${API}/items/:itemId/append-content`,
    async ({ params, request }) => {
      const itemId = params.itemId as string;
      const body = (await request.json()) as { text: string };
      const existing = store.fileContent.get(itemId) ?? "";
      const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const updated = existing
        ? `${existing}\n\n${timestamp} — ${body.text}`
        : `${timestamp} — ${body.text}`;
      store.fileContent.set(itemId, updated);
      return HttpResponse.json({ ok: true });
    },
  ),
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

  http.get(`${API}/email/connections/:id/calendars`, ({ params }) => {
    const id = params.id as string;
    const existing = store.emailConnections.get(id);
    if (!existing) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }
    const selected = new Set(existing.calendar_selected_ids ?? ["primary"]);
    const baseCalendars = store.emailCalendars.get(id) ?? [
      {
        calendar_id: "primary",
        summary: "Primary",
        primary: true,
        selected: true,
        access_role: "owner",
      },
      {
        calendar_id: "team@group.calendar.google.com",
        summary: "Team",
        primary: false,
        selected: false,
        access_role: "writer",
      },
      {
        calendar_id: "family@group.calendar.google.com",
        summary: "Family",
        primary: false,
        selected: false,
        access_role: "reader",
      },
    ];
    const calendars = baseCalendars.map((calendar) => ({
      ...calendar,
      selected: selected.has(calendar.calendar_id),
    }));
    store.emailCalendars.set(id, calendars);
    return HttpResponse.json(calendars);
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
      ...(patch.calendar_sync_enabled !== undefined && {
        calendar_sync_enabled: patch.calendar_sync_enabled,
      }),
      ...(patch.calendar_selected_ids !== undefined && {
        calendar_selected_ids: patch.calendar_selected_ids,
      }),
    };
    store.emailConnections.set(id, updated);
    if (patch.calendar_selected_ids !== undefined) {
      const selected = new Set(patch.calendar_selected_ids);
      const calendars = store.emailCalendars.get(id) ?? [];
      store.emailCalendars.set(
        id,
        calendars.map((calendar) => ({
          ...calendar,
          selected: selected.has(calendar.calendar_id),
        })),
      );
    }
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

  http.get(`${API}/email/proposals`, () => {
    return HttpResponse.json(store.emailProposals);
  }),

  http.post(`${API}/email/proposals/generate`, () => {
    const pending = store.emailProposals.filter((p) => p.status === "pending");
    if (pending.length === 0) {
      const proposal: EmailProposalResponse = {
        proposal_id: `proposal-${Date.now()}`,
        proposal_type: "Proposal.RescheduleMeeting",
        why: "Inbound email suggests a meeting should move by 30 minutes.",
        confidence: "medium",
        requires_confirmation: true,
        suggested_actions: ["gcal_update_event", "gmail_send_reply"],
        status: "pending",
        created_at: new Date().toISOString(),
      };
      store.emailProposals = [proposal, ...store.emailProposals];
    }
    return HttpResponse.json(store.emailProposals);
  }),

  http.post(`${API}/email/proposals/:proposalId/confirm`, ({ params }) => {
    const proposalId = params.proposalId as string;
    const index = store.emailProposals.findIndex(
      (proposal) => proposal.proposal_id === proposalId,
    );
    if (index === -1) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }
    const proposal = store.emailProposals[index]!;
    store.emailProposals[index] = { ...proposal, status: "confirmed" };
    return HttpResponse.json({
      proposal_id: proposalId,
      status: "confirmed",
    });
  }),

  http.post(`${API}/email/proposals/:proposalId/dismiss`, ({ params }) => {
    const proposalId = params.proposalId as string;
    const index = store.emailProposals.findIndex(
      (proposal) => proposal.proposal_id === proposalId,
    );
    if (index === -1) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }
    const proposal = store.emailProposals[index]!;
    store.emailProposals[index] = { ...proposal, status: "dismissed" };
    return HttpResponse.json({
      proposal_id: proposalId,
      status: "dismissed",
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
// Calendar handlers
// ---------------------------------------------------------------------------

const calendarHandlers = [
  http.get(`${API}/calendar/events`, ({ request }) => {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");

    const events = Array.from(store.items.values())
      .filter((record) => getBucket(record.item) === "calendar")
      .map((record) => itemToCalendarEvent(record))
      .filter((event) => {
        if (dateFrom && event.start_date && event.start_date < dateFrom) {
          return false;
        }
        if (dateTo && event.start_date && event.start_date > dateTo) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

    return HttpResponse.json(events);
  }),

  http.patch(`${API}/calendar/events/:canonicalId`, async ({ params, request }) => {
    const canonicalId = decodeURIComponent(params.canonicalId as string);
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      start_date?: string;
      end_date?: string;
    };
    const record = Array.from(store.items.values()).find(
      (candidate) => candidate.canonical_id === canonicalId,
    );
    if (!record) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }
    const item = { ...record.item } as Record<string, unknown>;
    if (body.name !== undefined) item.name = body.name;
    if (body.description !== undefined) item.description = body.description;
    if (body.start_date !== undefined) {
      item.startDate = body.start_date;
      item.startTime = body.start_date;
    }
    if (body.end_date !== undefined) item.endDate = body.end_date;

    const updated: ItemRecord = {
      ...record,
      item,
      updated_at: new Date().toISOString(),
    };
    store.items.set(updated.item_id, updated);
    return HttpResponse.json(itemToCalendarEvent(updated));
  }),

  http.post(
    `${API}/calendar/events/:canonicalId/rsvp`,
    async ({ params, request }) => {
      const canonicalId = decodeURIComponent(params.canonicalId as string);
      const body = (await request.json()) as { status?: string };
      const record = Array.from(store.items.values()).find(
        (candidate) => candidate.canonical_id === canonicalId,
      );
      if (!record) {
        return HttpResponse.json({ detail: "Not found" }, { status: 404 });
      }
      const item = { ...record.item } as Record<string, unknown>;
      const props = Array.isArray(item.additionalProperty)
        ? ([...item.additionalProperty] as Array<Record<string, unknown>>)
        : [];
      const idx = props.findIndex((entry) => entry.propertyID === "app:rsvpStatus");
      if (idx >= 0) {
        props[idx] = { ...props[idx], value: body.status };
      } else {
        props.push({
          "@type": "PropertyValue",
          propertyID: "app:rsvpStatus",
          value: body.status ?? null,
        });
      }
      item.additionalProperty = props;

      const updated: ItemRecord = {
        ...record,
        item,
        updated_at: new Date().toISOString(),
      };
      store.items.set(updated.item_id, updated);
      return HttpResponse.json(itemToCalendarEvent(updated));
    },
  ),

  http.delete(`${API}/calendar/events/:canonicalId`, ({ params }) => {
    const canonicalId = decodeURIComponent(params.canonicalId as string);
    const record = Array.from(store.items.values()).find(
      (candidate) => candidate.canonical_id === canonicalId,
    );
    if (!record) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }
    store.items.delete(record.item_id);
    const payload: CalendarEventDeleteResponse = {
      canonical_id: canonicalId,
      status: "deleted",
      provider_action: "deleted",
    };
    return HttpResponse.json(payload);
  }),
];

// ---------------------------------------------------------------------------
// Chat handlers (Copilot V1)
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
  ...calendarHandlers,
  ...chatHandlers,
  ...conversationHandlers,
  ...orgsHandlers,
];
