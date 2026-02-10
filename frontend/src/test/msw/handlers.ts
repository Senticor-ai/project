import { http, HttpResponse } from "msw";
import { store, buildSyncResponse, createFileRecord } from "./fixtures";
import type {
  ItemRecord,
  NirvanaImportSummary,
  ImportJobResponse,
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

const defaultImportSummary: NirvanaImportSummary = {
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
      error: null,
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
      error: null,
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
// Combined handler set
// ---------------------------------------------------------------------------

export const handlers = [
  ...itemsHandlers,
  ...filesHandlers,
  ...importsHandlers,
  ...authHandlers,
];
