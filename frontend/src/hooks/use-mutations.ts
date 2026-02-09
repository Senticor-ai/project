import { useRef } from "react";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ThingsApi } from "@/lib/api-client";
import type { ThingRecord } from "@/lib/api-client";
import {
  buildNewInboxJsonLd,
  buildNewReferenceJsonLd,
  buildNewProjectJsonLd,
  buildTriagePatch,
  buildNewActionJsonLd,
} from "@/lib/thing-serializer";
import type { Thing, ThingBucket, TriageResult } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";
import { THINGS_QUERY_KEY } from "./use-things";

// ---------------------------------------------------------------------------
// Cache keys for active and completed partitions
// ---------------------------------------------------------------------------

const ACTIVE_KEY = [...THINGS_QUERY_KEY, { completed: "false" }];
const COMPLETED_KEY = [...THINGS_QUERY_KEY, { completed: "true" }];

// ---------------------------------------------------------------------------
// Helpers: search both active + completed caches
// ---------------------------------------------------------------------------

function findThingId(
  qc: QueryClient,
  canonicalId: CanonicalId,
): string | undefined {
  const active = qc.getQueryData<ThingRecord[]>(ACTIVE_KEY);
  const match = active?.find((r) => r.canonical_id === canonicalId);
  if (match) return match.thing_id;

  const completed = qc.getQueryData<ThingRecord[]>(COMPLETED_KEY);
  return completed?.find((r) => r.canonical_id === canonicalId)?.thing_id;
}

function findRecord(
  qc: QueryClient,
  canonicalId: CanonicalId,
): ThingRecord | undefined {
  const active = qc.getQueryData<ThingRecord[]>(ACTIVE_KEY);
  const match = active?.find((r) => r.canonical_id === canonicalId);
  if (match) return match;

  const completed = qc.getQueryData<ThingRecord[]>(COMPLETED_KEY);
  return completed?.find((r) => r.canonical_id === canonicalId);
}

// ---------------------------------------------------------------------------
// Optimistic update helpers
// ---------------------------------------------------------------------------

type AdditionalProp = { "@type": string; propertyID: string; value: unknown };

/** Cancel in-flight queries and snapshot the active cache for rollback. */
async function snapshotActive(qc: QueryClient) {
  await qc.cancelQueries({ queryKey: ACTIVE_KEY });
  return qc.getQueryData<ThingRecord[]>(ACTIVE_KEY);
}

/** Remove a record from the active cache by canonical ID. */
function removeFromCache(qc: QueryClient, canonicalId: CanonicalId) {
  qc.setQueryData<ThingRecord[]>(ACTIVE_KEY, (old) =>
    old?.filter((r) => r.canonical_id !== canonicalId),
  );
}

/** Update app:bucket in the active cache for a record. */
function updateBucketInCache(
  qc: QueryClient,
  canonicalId: CanonicalId,
  newBucket: string,
) {
  qc.setQueryData<ThingRecord[]>(ACTIVE_KEY, (old) =>
    old?.map((r) =>
      r.canonical_id === canonicalId
        ? {
            ...r,
            thing: {
              ...r.thing,
              additionalProperty: (
                r.thing.additionalProperty as AdditionalProp[]
              ).map((p) =>
                p.propertyID === "app:bucket" ? { ...p, value: newBucket } : p,
              ),
            },
          }
        : r,
    ),
  );
}

// ---------------------------------------------------------------------------
// Capture inbox item
// ---------------------------------------------------------------------------

export function useCaptureInbox() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (rawText: string) => {
      const jsonLd = buildNewInboxJsonLd(rawText);
      return ThingsApi.create(jsonLd, "manual");
    },
    onMutate: async (rawText) => {
      const prev = await snapshotActive(qc);
      const tempId = `urn:app:inbox:temp-${Date.now()}`;
      const now = new Date().toISOString();
      const optimistic: ThingRecord = {
        thing_id: `temp-${Date.now()}`,
        canonical_id: tempId,
        source: "manual",
        thing: buildNewInboxJsonLd(rawText),
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ThingRecord[]>(ACTIVE_KEY, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Triage inbox item → Action / Reference / Archive
// ---------------------------------------------------------------------------

export function useTriageItem() {
  const qc = useQueryClient();
  const savedIds = useRef(new Map<string, string>());

  return useMutation({
    mutationFn: async ({
      item,
      result,
    }: {
      item: Thing;
      result: TriageResult;
    }) => {
      const thingId = savedIds.current.get(item.id) ?? findThingId(qc, item.id);
      if (!thingId) throw new Error(`Thing not found: ${item.id}`);

      if (result.targetBucket === "archive") {
        return ThingsApi.archive(thingId);
      }

      const patch = buildTriagePatch(item, result);
      return ThingsApi.update(thingId, patch);
    },
    onMutate: async ({ item, result }) => {
      const thingId = findThingId(qc, item.id);
      if (thingId) savedIds.current.set(item.id, thingId);

      const prev = await snapshotActive(qc);
      if (result.targetBucket === "archive") {
        removeFromCache(qc, item.id);
      } else {
        updateBucketInCache(qc, item.id, result.targetBucket);
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: (_data, _err, { item }) => {
      savedIds.current.delete(item.id);
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Complete action
// ---------------------------------------------------------------------------

export function useCompleteAction() {
  const qc = useQueryClient();
  const savedRecords = useRef(new Map<string, ThingRecord>());

  return useMutation({
    mutationFn: async (canonicalId: CanonicalId) => {
      const record =
        savedRecords.current.get(canonicalId) ?? findRecord(qc, canonicalId);
      if (!record) throw new Error(`Thing not found: ${canonicalId}`);

      const isCompleted = !!record.thing.endTime;
      return ThingsApi.update(record.thing_id, {
        endTime: isCompleted ? null : new Date().toISOString(),
      });
    },
    onMutate: async (canonicalId) => {
      const record = findRecord(qc, canonicalId);
      if (record) savedRecords.current.set(canonicalId, record);

      const prev = await snapshotActive(qc);
      removeFromCache(qc, canonicalId);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: (_data, _err, canonicalId) => {
      savedRecords.current.delete(canonicalId);
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Toggle focus
// ---------------------------------------------------------------------------

export function useToggleFocus() {
  const qc = useQueryClient();
  const savedRecords = useRef(new Map<string, ThingRecord>());

  return useMutation({
    mutationFn: async (canonicalId: CanonicalId) => {
      const record =
        savedRecords.current.get(canonicalId) ?? findRecord(qc, canonicalId);
      if (!record) throw new Error(`Thing not found: ${canonicalId}`);

      const props = record.thing.additionalProperty as
        | Array<{ propertyID: string; value: unknown }>
        | undefined;
      const currentFocused =
        props?.find((p) => p.propertyID === "app:isFocused")?.value ?? false;
      return ThingsApi.update(record.thing_id, {
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:isFocused",
            value: !currentFocused,
          },
        ],
      });
    },
    onMutate: async (canonicalId) => {
      const record = findRecord(qc, canonicalId);
      if (record) savedRecords.current.set(canonicalId, record);

      const prev = await snapshotActive(qc);
      qc.setQueryData<ThingRecord[]>(ACTIVE_KEY, (old) =>
        old?.map((r) =>
          r.canonical_id === canonicalId
            ? {
                ...r,
                thing: {
                  ...r.thing,
                  additionalProperty: (
                    r.thing.additionalProperty as AdditionalProp[]
                  ).map((p) =>
                    p.propertyID === "app:isFocused"
                      ? { ...p, value: !p.value }
                      : p,
                  ),
                },
              }
            : r,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: (_data, _err, canonicalId) => {
      savedRecords.current.delete(canonicalId);
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Move action to different bucket
// ---------------------------------------------------------------------------

export function useMoveAction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      canonicalId,
      bucket,
    }: {
      canonicalId: CanonicalId;
      bucket: string;
    }) => {
      const thingId = findThingId(qc, canonicalId);
      if (!thingId) throw new Error(`Thing not found: ${canonicalId}`);

      return ThingsApi.update(thingId, {
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: bucket,
          },
        ],
      });
    },
    onMutate: async ({ canonicalId, bucket }) => {
      const prev = await snapshotActive(qc);
      updateBucketInCache(qc, canonicalId, bucket);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Update item (general-purpose field edit)
// ---------------------------------------------------------------------------

export function useUpdateItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      canonicalId,
      patch,
    }: {
      canonicalId: CanonicalId;
      patch: Record<string, unknown>;
    }) => {
      const thingId = findThingId(qc, canonicalId);
      if (!thingId) throw new Error(`Thing not found: ${canonicalId}`);

      return ThingsApi.update(thingId, patch);
    },
    onMutate: async ({ canonicalId, patch }) => {
      const prev = await snapshotActive(qc);
      qc.setQueryData<ThingRecord[]>(ACTIVE_KEY, (old) =>
        old?.map((r) =>
          r.canonical_id === canonicalId
            ? { ...r, thing: { ...r.thing, ...patch } }
            : r,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Add action (rapid entry)
// ---------------------------------------------------------------------------

export function useAddAction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      title,
      bucket,
    }: {
      title: string;
      bucket: ThingBucket;
    }) => {
      const jsonLd = buildNewActionJsonLd(title, bucket);
      return ThingsApi.create(jsonLd, "manual");
    },
    onMutate: async ({ title, bucket }) => {
      const prev = await snapshotActive(qc);
      const now = new Date().toISOString();
      const optimistic: ThingRecord = {
        thing_id: `temp-${Date.now()}`,
        canonical_id: `urn:app:action:temp-${Date.now()}` as CanonicalId,
        source: "manual",
        thing: buildNewActionJsonLd(title, bucket),
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ThingRecord[]>(ACTIVE_KEY, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Add reference (rapid entry)
// ---------------------------------------------------------------------------

export function useAddReference() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (title: string) => {
      const jsonLd = buildNewReferenceJsonLd(title);
      return ThingsApi.create(jsonLd, "manual");
    },
    onMutate: async (title) => {
      const prev = await snapshotActive(qc);
      const now = new Date().toISOString();
      const optimistic: ThingRecord = {
        thing_id: `temp-${Date.now()}`,
        canonical_id: `urn:app:ref:temp-${Date.now()}`,
        source: "manual",
        thing: buildNewReferenceJsonLd(title),
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ThingRecord[]>(ACTIVE_KEY, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Add action to project (rapid entry within ProjectTree)
// ---------------------------------------------------------------------------

export function useAddProjectAction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      title,
    }: {
      projectId: CanonicalId;
      title: string;
    }) => {
      const jsonLd = buildNewActionJsonLd(title, "next", { projectId });
      return ThingsApi.create(jsonLd, "manual");
    },
    onMutate: async ({ projectId, title }) => {
      const prev = await snapshotActive(qc);
      const now = new Date().toISOString();
      const optimistic: ThingRecord = {
        thing_id: `temp-${Date.now()}`,
        canonical_id: `urn:app:action:temp-${Date.now()}` as CanonicalId,
        source: "manual",
        thing: buildNewActionJsonLd(title, "next", { projectId }),
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ThingRecord[]>(ACTIVE_KEY, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Create project
// ---------------------------------------------------------------------------

export function useCreateProject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      desiredOutcome,
    }: {
      name: string;
      desiredOutcome: string;
    }) => {
      const jsonLd = buildNewProjectJsonLd(name, desiredOutcome);
      return ThingsApi.create(jsonLd, "manual");
    },
    onMutate: async ({ name, desiredOutcome }) => {
      const prev = await snapshotActive(qc);
      const now = new Date().toISOString();
      const optimistic: ThingRecord = {
        thing_id: `temp-${Date.now()}`,
        canonical_id: `urn:app:project:temp-${Date.now()}` as CanonicalId,
        source: "manual",
        thing: buildNewProjectJsonLd(name, desiredOutcome),
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ThingRecord[]>(ACTIVE_KEY, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Archive reference
// ---------------------------------------------------------------------------

export function useArchiveReference() {
  const qc = useQueryClient();
  const savedIds = useRef(new Map<string, string>());

  return useMutation({
    mutationFn: async (canonicalId: CanonicalId) => {
      const thingId =
        savedIds.current.get(canonicalId) ?? findThingId(qc, canonicalId);
      if (!thingId) throw new Error(`Thing not found: ${canonicalId}`);

      return ThingsApi.archive(thingId);
    },
    onMutate: async (canonicalId) => {
      const thingId = findThingId(qc, canonicalId);
      if (thingId) savedIds.current.set(canonicalId, thingId);

      const prev = await snapshotActive(qc);
      removeFromCache(qc, canonicalId);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: (_data, _err, canonicalId) => {
      savedIds.current.delete(canonicalId);
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}
