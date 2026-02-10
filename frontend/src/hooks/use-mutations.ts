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
  buildNewFileInboxJsonLd,
  buildNewUrlInboxJsonLd,
} from "@/lib/thing-serializer";
import { classifyText, classifyFile } from "@/lib/intake-classifier";
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

/**
 * Check if a record's @type needs promotion when moving to a target bucket.
 * Compares the current @type against the expected type for the target bucket.
 * E.g. Action → reference needs promotion (to CreativeWork),
 * but Action → next does not.
 */
function needsTypePromotion(
  qc: QueryClient,
  canonicalId: CanonicalId,
  targetBucket: string,
): boolean {
  const record = findRecord(qc, canonicalId);
  if (!record) return false;
  const currentType = record.thing["@type"] as string;
  const expectedType = targetTypeForBucket(targetBucket);
  return currentType !== expectedType;
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

/** Cancel in-flight queries and snapshot both caches for rollback. */
async function snapshotBoth(qc: QueryClient) {
  await qc.cancelQueries({ queryKey: ACTIVE_KEY });
  await qc.cancelQueries({ queryKey: COMPLETED_KEY });
  return {
    prevActive: qc.getQueryData<ThingRecord[]>(ACTIVE_KEY),
    prevCompleted: qc.getQueryData<ThingRecord[]>(COMPLETED_KEY),
  };
}

/** Remove a record from the completed cache by canonical ID. */
function removeFromCompleted(qc: QueryClient, canonicalId: CanonicalId) {
  qc.setQueryData<ThingRecord[]>(COMPLETED_KEY, (old) =>
    old?.filter((r) => r.canonical_id !== canonicalId),
  );
}

/** Add a record to a cache partition. */
function addToCache(
  qc: QueryClient,
  key: readonly unknown[],
  record: ThingRecord,
) {
  qc.setQueryData<ThingRecord[]>(key, (old) => [...(old ?? []), record]);
}

/** Remove a record from the active cache by canonical ID. */
function removeFromCache(qc: QueryClient, canonicalId: CanonicalId) {
  qc.setQueryData<ThingRecord[]>(ACTIVE_KEY, (old) =>
    old?.filter((r) => r.canonical_id !== canonicalId),
  );
}

/** Determine the correct @type for a target bucket. */
function targetTypeForBucket(bucket: string): string {
  return bucket === "reference" ? "CreativeWork" : "Action";
}

/** Promote @type to the appropriate type in the active cache. */
function promoteTypeInCache(
  qc: QueryClient,
  canonicalId: CanonicalId,
  targetType: string,
) {
  qc.setQueryData<ThingRecord[]>(ACTIVE_KEY, (old) =>
    old?.map((r) =>
      r.canonical_id === canonicalId
        ? { ...r, thing: { ...r.thing, "@type": targetType } }
        : r,
    ),
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
      const classification = classifyText(rawText);
      const jsonLd =
        classification.captureSource.kind === "url"
          ? buildNewUrlInboxJsonLd(classification.captureSource.url)
          : buildNewInboxJsonLd(rawText);
      return ThingsApi.create(jsonLd, "manual");
    },
    onMutate: async (rawText) => {
      const prev = await snapshotActive(qc);
      const classification = classifyText(rawText);
      const tempId = `urn:app:inbox:temp-${Date.now()}`;
      const now = new Date().toISOString();
      const thing =
        classification.captureSource.kind === "url"
          ? buildNewUrlInboxJsonLd(classification.captureSource.url)
          : buildNewInboxJsonLd(rawText);
      const optimistic: ThingRecord = {
        thing_id: `temp-${Date.now()}`,
        canonical_id: tempId,
        source: "manual",
        thing,
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
// Capture file → inbox item with detected type
// ---------------------------------------------------------------------------

export function useCaptureFile() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const classification = classifyFile(file);
      const jsonLd = buildNewFileInboxJsonLd(classification, file.name);
      return ThingsApi.create(jsonLd, "manual");
    },
    onMutate: async (file) => {
      const prev = await snapshotActive(qc);
      const classification = classifyFile(file);
      const tempId = `urn:app:inbox:temp-${Date.now()}`;
      const now = new Date().toISOString();
      const optimistic: ThingRecord = {
        thing_id: `temp-${Date.now()}`,
        canonical_id: tempId,
        source: "manual",
        thing: buildNewFileInboxJsonLd(classification, file.name),
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

      if (result.targetBucket === "archive") {
        const record = findRecord(qc, item.id);
        const { prevActive, prevCompleted } = await snapshotBoth(qc);
        removeFromCache(qc, item.id);
        // Optimistically show in Done section
        if (record) {
          addToCache(qc, COMPLETED_KEY, {
            ...record,
            thing: { ...record.thing, endTime: new Date().toISOString() },
          });
        }
        return { prevActive, prevCompleted };
      }

      const prev = await snapshotActive(qc);
      updateBucketInCache(qc, item.id, result.targetBucket);
      if (needsTypePromotion(qc, item.id, result.targetBucket)) {
        promoteTypeInCache(
          qc,
          item.id,
          targetTypeForBucket(result.targetBucket),
        );
      }
      return { prevActive: prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevActive) qc.setQueryData(ACTIVE_KEY, context.prevActive);
      if (context?.prevCompleted)
        qc.setQueryData(COMPLETED_KEY, context.prevCompleted);
    },
    onSettled: (_data, _err, { item }) => {
      savedIds.current.delete(item.id);
      // Only invalidate active partition — triage doesn't affect completed items,
      // and archive optimistically adds to COMPLETED_KEY which we want to preserve.
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
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

      const { prevActive, prevCompleted } = await snapshotBoth(qc);
      const isCompleted = !!record?.thing.endTime;

      if (isCompleted && record) {
        // Un-completing: move from COMPLETED → ACTIVE (clear endTime)
        removeFromCompleted(qc, canonicalId);
        addToCache(qc, ACTIVE_KEY, {
          ...record,
          thing: { ...record.thing, endTime: undefined },
        });
      } else {
        // Completing: move from ACTIVE → COMPLETED (set endTime)
        removeFromCache(qc, canonicalId);
        if (record) {
          addToCache(qc, COMPLETED_KEY, {
            ...record,
            thing: { ...record.thing, endTime: new Date().toISOString() },
          });
        }
      }

      return { prevActive, prevCompleted };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevActive) qc.setQueryData(ACTIVE_KEY, context.prevActive);
      if (context?.prevCompleted)
        qc.setQueryData(COMPLETED_KEY, context.prevCompleted);
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
  const savedMeta = useRef(
    new Map<string, { thingId: string; needsPromotion: boolean }>(),
  );

  return useMutation({
    mutationFn: async ({
      canonicalId,
      bucket,
    }: {
      canonicalId: CanonicalId;
      bucket: string;
    }) => {
      const meta = savedMeta.current.get(canonicalId);
      const thingId = meta?.thingId ?? findThingId(qc, canonicalId);
      if (!thingId) throw new Error(`Thing not found: ${canonicalId}`);

      const needsPromotion =
        meta?.needsPromotion ?? needsTypePromotion(qc, canonicalId, bucket);

      const patch: Record<string, unknown> = {
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: bucket,
          },
        ],
      };
      if (needsPromotion) {
        patch["@type"] = targetTypeForBucket(bucket);
      }
      return ThingsApi.update(thingId, patch);
    },
    onMutate: async ({ canonicalId, bucket }) => {
      const thingId = findThingId(qc, canonicalId);
      const needsPromotion = needsTypePromotion(qc, canonicalId, bucket);
      if (thingId)
        savedMeta.current.set(canonicalId, { thingId, needsPromotion });

      const prev = await snapshotActive(qc);
      updateBucketInCache(qc, canonicalId, bucket);
      if (needsPromotion) {
        promoteTypeInCache(qc, canonicalId, targetTypeForBucket(bucket));
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: (_data, _err, { canonicalId }) => {
      savedMeta.current.delete(canonicalId);
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

      const record = findRecord(qc, canonicalId);
      const { prevActive, prevCompleted } = await snapshotBoth(qc);
      removeFromCache(qc, canonicalId);
      // Optimistically show in Archived section
      if (record) {
        addToCache(qc, COMPLETED_KEY, {
          ...record,
          thing: { ...record.thing, endTime: new Date().toISOString() },
        });
      }
      return { prevActive, prevCompleted };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevActive) qc.setQueryData(ACTIVE_KEY, context.prevActive);
      if (context?.prevCompleted)
        qc.setQueryData(COMPLETED_KEY, context.prevCompleted);
    },
    onSettled: (_data, _err, canonicalId) => {
      savedIds.current.delete(canonicalId);
      // Only invalidate active partition — archive optimistically adds to
      // COMPLETED_KEY which we want to preserve until next completed refresh.
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}
