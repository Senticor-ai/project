import { http, HttpResponse } from "msw";
import { store, buildSyncResponse, createFileRecord } from "./fixtures";
import type {
  ThingRecord,
  NirvanaImportSummary,
  ImportJobResponse,
} from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = "*/api";

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
// Things API handlers
// ---------------------------------------------------------------------------

export const thingsHandlers = [
  // Sync endpoint — used by useThings / useAllThings
  http.get(`${API}/things/sync`, ({ request }) => {
    const url = new URL(request.url);
    const completed = url.searchParams.get("completed") ?? "false";
    const all = Array.from(store.things.values());

    const filtered = all.filter((r) => {
      const hasEndTime = !!r.thing.endTime;
      return completed === "true" ? hasEndTime : !hasEndTime;
    });

    return HttpResponse.json(buildSyncResponse(filtered));
  }),

  // Create thing — used by useCaptureInbox, useAddAction, useAddReference
  http.post(`${API}/things`, async ({ request }) => {
    const body = (await request.json()) as {
      thing: Record<string, unknown>;
      source: string;
    };
    const thingId = `msw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const canonicalId =
      (body.thing["@id"] as string) ?? `urn:app:inbox:${thingId}`;

    const record: ThingRecord = {
      thing_id: thingId,
      canonical_id: canonicalId,
      source: body.source,
      thing: body.thing,
      created_at: now,
      updated_at: now,
    };
    store.things.set(thingId, record);
    return HttpResponse.json(record, { status: 201 });
  }),

  // Update thing — used by useMoveAction, useToggleFocus, useUpdateItem, useTriageItem, useCompleteAction
  http.patch(`${API}/things/:thingId`, async ({ params, request }) => {
    const thingId = params.thingId as string;
    const body = (await request.json()) as { thing: Record<string, unknown> };
    const existing = store.things.get(thingId);

    if (!existing) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }

    const merged = deepMerge(existing.thing, body.thing);
    const updated: ThingRecord = {
      ...existing,
      thing: merged,
      updated_at: new Date().toISOString(),
    };
    store.things.set(thingId, updated);
    return HttpResponse.json(updated);
  }),

  // Archive thing — used by useArchiveReference
  http.delete(`${API}/things/:thingId`, ({ params }) => {
    const thingId = params.thingId as string;
    const existing = store.things.get(thingId);

    if (!existing) {
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    }

    store.things.delete(thingId);
    return HttpResponse.json({
      thing_id: thingId,
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
  ...thingsHandlers,
  ...filesHandlers,
  ...importsHandlers,
  ...authHandlers,
];
