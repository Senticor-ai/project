import { useCallback, useRef } from "react";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ItemsApi } from "@/lib/api-client";
import type { ItemRecord } from "@/lib/api-client";
import { uploadFile } from "@/lib/file-upload";
import {
  buildNewInboxJsonLd,
  buildNewReferenceJsonLd,
  buildNewProjectJsonLd,
  buildTriagePatch,
  buildNewActionJsonLd,
  buildNewFileInboxJsonLd,
  buildNewUrlInboxJsonLd,
  buildNewFileReferenceJsonLd,
  buildReadActionTriagePatch,
  fromJsonLd,
} from "@/lib/item-serializer";
import { classifyText, classifyFile } from "@/lib/intake-classifier";
import { isActionItem } from "@/model/types";
import type { ActionItem, ActionItemBucket, TriageResult } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";
import { ITEMS_QUERY_KEY } from "./use-items";

// ---------------------------------------------------------------------------
// Cache keys for active and completed partitions
// ---------------------------------------------------------------------------

const ACTIVE_KEY = [...ITEMS_QUERY_KEY, { completed: "false" }];
const COMPLETED_KEY = [...ITEMS_QUERY_KEY, { completed: "true" }];

// ---------------------------------------------------------------------------
// Helpers: search both active + completed caches
// ---------------------------------------------------------------------------

function findItemId(
  qc: QueryClient,
  canonicalId: CanonicalId,
): string | undefined {
  const active = qc.getQueryData<ItemRecord[]>(ACTIVE_KEY);
  const match = active?.find((r) => r.canonical_id === canonicalId);
  if (match) return match.item_id;

  const completed = qc.getQueryData<ItemRecord[]>(COMPLETED_KEY);
  return completed?.find((r) => r.canonical_id === canonicalId)?.item_id;
}

function findRecord(
  qc: QueryClient,
  canonicalId: CanonicalId,
): ItemRecord | undefined {
  const active = qc.getQueryData<ItemRecord[]>(ACTIVE_KEY);
  const match = active?.find((r) => r.canonical_id === canonicalId);
  if (match) return match;

  const completed = qc.getQueryData<ItemRecord[]>(COMPLETED_KEY);
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
  const currentType = record.item["@type"] as string;
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
  return qc.getQueryData<ItemRecord[]>(ACTIVE_KEY);
}

/** Cancel in-flight queries and snapshot both caches for rollback. */
async function snapshotBoth(qc: QueryClient) {
  await qc.cancelQueries({ queryKey: ACTIVE_KEY });
  await qc.cancelQueries({ queryKey: COMPLETED_KEY });
  return {
    prevActive: qc.getQueryData<ItemRecord[]>(ACTIVE_KEY),
    prevCompleted: qc.getQueryData<ItemRecord[]>(COMPLETED_KEY),
  };
}

/** Remove a record from the completed cache by canonical ID. */
function removeFromCompleted(qc: QueryClient, canonicalId: CanonicalId) {
  qc.setQueryData<ItemRecord[]>(COMPLETED_KEY, (old) =>
    old?.filter((r) => r.canonical_id !== canonicalId),
  );
}

/** Add a record to a cache partition. */
function addToCache(
  qc: QueryClient,
  key: readonly unknown[],
  record: ItemRecord,
) {
  qc.setQueryData<ItemRecord[]>(key, (old) => [...(old ?? []), record]);
}

/** Remove a record from the active cache by canonical ID. */
function removeFromCache(qc: QueryClient, canonicalId: CanonicalId) {
  qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) =>
    old?.filter((r) => r.canonical_id !== canonicalId),
  );
}

/** Determine the correct @type for a target bucket. */
function targetTypeForBucket(bucket: string): string {
  return bucket === "reference" ? "CreativeWork" : "Action";
}

/** Extract app:bucket from a raw ItemRecord. */
function getBucketFromRecord(record: ItemRecord): string | undefined {
  const props = record.item.additionalProperty as AdditionalProp[] | undefined;
  return props?.find((p) => p.propertyID === "app:bucket")?.value as
    | string
    | undefined;
}

/**
 * Should triage of this item trigger a split into ReadAction + reference?
 * Only for DigitalDocument items triaged from inbox to an action bucket.
 */
function shouldSplitOnTriage(
  qc: QueryClient,
  canonicalId: CanonicalId,
  targetBucket: string,
): boolean {
  if (targetBucket === "reference" || targetBucket === "archive") return false;
  const record = findRecord(qc, canonicalId);
  if (!record) return false;
  const currentBucket = getBucketFromRecord(record);
  if (currentBucket !== "inbox") return false;
  return (record.item["@type"] as string) === "DigitalDocument";
}

/** Promote @type to the appropriate type in the active cache. */
function promoteTypeInCache(
  qc: QueryClient,
  canonicalId: CanonicalId,
  targetType: string,
) {
  qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) =>
    old?.map((r) =>
      r.canonical_id === canonicalId
        ? { ...r, item: { ...r.item, "@type": targetType } }
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
  qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) =>
    old?.map((r) =>
      r.canonical_id === canonicalId
        ? {
            ...r,
            item: {
              ...r.item,
              additionalProperty: (
                r.item.additionalProperty as AdditionalProp[]
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

  // Internal mutation accepts pre-built JSON-LD so onMutate and mutationFn
  // share the exact same object (same @id). This prevents the race condition
  // where optimistic records have a different canonical_id than the server.
  const mutation = useMutation({
    mutationFn: async (jsonLd: Record<string, unknown>) => {
      return ItemsApi.create(jsonLd, "manual");
    },
    onMutate: async (jsonLd) => {
      const prev = await snapshotActive(qc);
      const now = new Date().toISOString();
      const optimistic: ItemRecord = {
        item_id: `temp-${Date.now()}`,
        canonical_id: jsonLd["@id"] as string,
        source: "manual",
        item: jsonLd,
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onSuccess: (data) => {
      // Replace the optimistic record (temp item_id) with real server data.
      // Both share the same canonical_id because the same @id was sent.
      qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) =>
        old?.map((r) => (r.canonical_id === data.canonical_id ? data : r)),
      );
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
    },
  });

  // Public API: callers pass raw text, we build JSON-LD once and forward it.
  const mutate = useCallback(
    (rawText: string) => {
      const classification = classifyText(rawText);
      const jsonLd =
        classification.captureSource.kind === "url"
          ? buildNewUrlInboxJsonLd(classification.captureSource.url)
          : buildNewInboxJsonLd(rawText);
      mutation.mutate(jsonLd);
    },
    [mutation],
  );

  const mutateAsync = useCallback(
    async (rawText: string) => {
      const classification = classifyText(rawText);
      const jsonLd =
        classification.captureSource.kind === "url"
          ? buildNewUrlInboxJsonLd(classification.captureSource.url)
          : buildNewInboxJsonLd(rawText);
      return mutation.mutateAsync(jsonLd);
    },
    [mutation],
  );

  return { ...mutation, mutate, mutateAsync };
}

// ---------------------------------------------------------------------------
// Capture file → inbox item with detected type
// ---------------------------------------------------------------------------

export function useCaptureFile() {
  const qc = useQueryClient();

  type CaptureFileVars = { file: File; jsonLd: Record<string, unknown> };

  const mutation = useMutation({
    mutationFn: async ({ file, jsonLd }: CaptureFileVars) => {
      // 1. Create the item (metadata-only)
      const itemRecord = await ItemsApi.create(jsonLd, "manual");

      // Replace optimistic record immediately so findItemId returns the real
      // server item_id.  Without this, a fast triage (useMoveAction) during
      // the file upload below would PATCH /items/temp-xxx → 404.
      qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) =>
        old?.map((r) =>
          r.canonical_id === itemRecord.canonical_id ? itemRecord : r,
        ),
      );

      // 2. Upload the binary (tolerate failure — item already exists)
      try {
        const fileRecord = await uploadFile(file);
        // 3. Link the uploaded file to the item via PATCH
        try {
          await ItemsApi.update(itemRecord.item_id, {
            additionalProperty: [
              {
                "@type": "PropertyValue",
                propertyID: "app:fileId",
                value: fileRecord.file_id,
              },
              {
                "@type": "PropertyValue",
                propertyID: "app:downloadUrl",
                value: fileRecord.download_url,
              },
            ],
          });
        } catch {
          // PATCH failure tolerated — item + file exist, link can be retried
        }
      } catch {
        // Upload failure tolerated — item metadata is persisted
      }

      return itemRecord;
    },
    onMutate: async ({ jsonLd }: CaptureFileVars) => {
      const prev = await snapshotActive(qc);
      const now = new Date().toISOString();
      const optimistic: ItemRecord = {
        item_id: `temp-${Date.now()}`,
        canonical_id: jsonLd["@id"] as string,
        source: "manual",
        item: jsonLd,
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onSuccess: (data) => {
      qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) =>
        old?.map((r) => (r.canonical_id === data.canonical_id ? data : r)),
      );
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
    },
  });

  const mutate = useCallback(
    (file: File) => {
      const classification = classifyFile(file);
      const jsonLd = buildNewFileInboxJsonLd(classification, file.name);
      mutation.mutate({ file, jsonLd });
    },
    [mutation],
  );

  const mutateAsync = useCallback(
    async (file: File) => {
      const classification = classifyFile(file);
      const jsonLd = buildNewFileInboxJsonLd(classification, file.name);
      return mutation.mutateAsync({ file, jsonLd });
    },
    [mutation],
  );

  return { ...mutation, mutate, mutateAsync };
}

// ---------------------------------------------------------------------------
// Triage inbox item → Action / Reference / Archive
// ---------------------------------------------------------------------------

export function useTriageItem() {
  const qc = useQueryClient();
  const savedIds = useRef(new Map<string, string>());
  const savedSplitDecisions = useRef(
    new Map<string, { shouldSplit: boolean; record?: ItemRecord }>(),
  );

  return useMutation({
    mutationFn: async ({
      item,
      result,
    }: {
      item: ActionItem;
      result: TriageResult;
    }) => {
      const itemId = savedIds.current.get(item.id) ?? findItemId(qc, item.id);
      if (!itemId) throw new Error(`Item not found: ${item.id}`);

      if (result.targetBucket === "archive") {
        return ItemsApi.archive(itemId);
      }

      // Read split decision saved by onMutate (before optimistic cache changes)
      const splitDecision = savedSplitDecisions.current.get(item.id);
      if (splitDecision?.shouldSplit && splitDecision.record) {
        // 1. Create the reference (DigitalDocument in reference bucket)
        const refJsonLd = buildNewFileReferenceJsonLd(
          item,
          splitDecision.record,
        );
        const refRecord = await ItemsApi.create(refJsonLd, "auto-split");
        // 2. Patch existing item → ReadAction with object ref
        const patch = buildReadActionTriagePatch(
          item,
          result,
          refRecord.canonical_id as CanonicalId,
        );
        return ItemsApi.update(itemId, patch);
      }

      const patch = buildTriagePatch(item, result);
      return ItemsApi.update(itemId, patch);
    },
    onMutate: async ({ item, result }) => {
      const itemId = findItemId(qc, item.id);
      if (itemId) savedIds.current.set(item.id, itemId);

      // Compute split decision BEFORE optimistic updates change the cache
      const doSplit = shouldSplitOnTriage(qc, item.id, result.targetBucket);
      const record = doSplit ? findRecord(qc, item.id) : undefined;
      savedSplitDecisions.current.set(item.id, {
        shouldSplit: doSplit,
        record,
      });

      if (result.targetBucket === "archive") {
        const archiveRecord = findRecord(qc, item.id);
        const { prevActive, prevCompleted } = await snapshotBoth(qc);
        removeFromCache(qc, item.id);
        // Optimistically show in Done section
        if (archiveRecord) {
          addToCache(qc, COMPLETED_KEY, {
            ...archiveRecord,
            item: { ...archiveRecord.item, endTime: new Date().toISOString() },
          });
        }
        return { prevActive, prevCompleted };
      }

      const prev = await snapshotActive(qc);

      if (doSplit && record) {
        // Optimistically add a reference record to the cache
        const now = new Date().toISOString();
        const refJsonLd = buildNewFileReferenceJsonLd(item, record);
        const optimisticRef: ItemRecord = {
          item_id: `temp-ref-${Date.now()}`,
          canonical_id: refJsonLd["@id"] as string,
          source: "auto-split",
          item: refJsonLd,
          created_at: now,
          updated_at: now,
        };
        addToCache(qc, ACTIVE_KEY, optimisticRef);
        // Promote type to ReadAction with object ref
        promoteTypeInCache(qc, item.id, "ReadAction");
      }

      updateBucketInCache(qc, item.id, result.targetBucket);
      if (!doSplit && needsTypePromotion(qc, item.id, result.targetBucket)) {
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
    onSettled: async (_data, _err, { item }) => {
      savedIds.current.delete(item.id);
      savedSplitDecisions.current.delete(item.id);
      // Only invalidate active partition — triage doesn't affect completed items,
      // and archive optimistically adds to COMPLETED_KEY which we want to preserve.
      await qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Complete action
// ---------------------------------------------------------------------------

export function useCompleteAction() {
  const qc = useQueryClient();
  const savedRecords = useRef(new Map<string, ItemRecord>());

  return useMutation({
    mutationFn: async (canonicalId: CanonicalId) => {
      const record =
        savedRecords.current.get(canonicalId) ?? findRecord(qc, canonicalId);
      if (!record) throw new Error(`Item not found: ${canonicalId}`);

      const isCompleted = !!record.item.endTime;
      return ItemsApi.update(record.item_id, {
        endTime: isCompleted ? null : new Date().toISOString(),
      });
    },
    onMutate: async (canonicalId) => {
      const record = findRecord(qc, canonicalId);
      if (record) savedRecords.current.set(canonicalId, record);

      const { prevActive, prevCompleted } = await snapshotBoth(qc);
      const isCompleted = !!record?.item.endTime;

      if (isCompleted && record) {
        // Un-completing: move from COMPLETED → ACTIVE (clear endTime)
        removeFromCompleted(qc, canonicalId);
        addToCache(qc, ACTIVE_KEY, {
          ...record,
          item: { ...record.item, endTime: undefined },
        });
      } else {
        // Completing: move from ACTIVE → COMPLETED (set endTime)
        removeFromCache(qc, canonicalId);
        if (record) {
          addToCache(qc, COMPLETED_KEY, {
            ...record,
            item: { ...record.item, endTime: new Date().toISOString() },
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
    onSettled: async (_data, _err, canonicalId) => {
      savedRecords.current.delete(canonicalId);
      await qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Toggle focus
// ---------------------------------------------------------------------------

export function useToggleFocus() {
  const qc = useQueryClient();
  const savedRecords = useRef(new Map<string, ItemRecord>());

  return useMutation({
    mutationFn: async (canonicalId: CanonicalId) => {
      const record =
        savedRecords.current.get(canonicalId) ?? findRecord(qc, canonicalId);
      if (!record) throw new Error(`Item not found: ${canonicalId}`);

      const props = record.item.additionalProperty as
        | Array<{ propertyID: string; value: unknown }>
        | undefined;
      const currentFocused =
        props?.find((p) => p.propertyID === "app:isFocused")?.value ?? false;
      return ItemsApi.update(record.item_id, {
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
      qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) =>
        old?.map((r) =>
          r.canonical_id === canonicalId
            ? {
                ...r,
                item: {
                  ...r.item,
                  additionalProperty: (
                    r.item.additionalProperty as AdditionalProp[]
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
    onSettled: async (_data, _err, canonicalId) => {
      savedRecords.current.delete(canonicalId);
      await qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Move action to different bucket
// ---------------------------------------------------------------------------

export function useMoveAction() {
  const qc = useQueryClient();
  const savedMeta = useRef(
    new Map<
      string,
      {
        itemId: string;
        needsPromotion: boolean;
        shouldSplit?: boolean;
        record?: ItemRecord;
        actionItem?: ActionItem;
        projectId?: CanonicalId;
      }
    >(),
  );

  return useMutation({
    mutationFn: async ({
      canonicalId,
      bucket,
      projectId,
    }: {
      canonicalId: CanonicalId;
      bucket: string;
      projectId?: CanonicalId;
    }) => {
      const meta = savedMeta.current.get(canonicalId);
      const itemId = meta?.itemId ?? findItemId(qc, canonicalId);
      if (!itemId) throw new Error(`Item not found: ${canonicalId}`);
      const effectiveProjectId = meta?.projectId ?? projectId;

      // Split path: DigitalDocument from inbox → action bucket
      if (meta?.shouldSplit && meta.record && meta.actionItem) {
        // Inject projectId into actionItem so the reference inherits it
        const itemWithProject = effectiveProjectId
          ? { ...meta.actionItem, projectIds: [effectiveProjectId] }
          : meta.actionItem;
        // 1. Create the reference (DigitalDocument in reference bucket)
        const refJsonLd = buildNewFileReferenceJsonLd(
          itemWithProject,
          meta.record,
        );
        const refRecord = await ItemsApi.create(refJsonLd, "auto-split");
        // 2. Patch existing item → ReadAction with object ref
        const triageResult: TriageResult = {
          targetBucket: bucket as TriageResult["targetBucket"],
          projectId: effectiveProjectId,
        };
        const patch = buildReadActionTriagePatch(
          meta.actionItem,
          triageResult,
          refRecord.canonical_id as CanonicalId,
        );
        return ItemsApi.update(itemId, patch);
      }

      const needsPromotion =
        meta?.needsPromotion ?? needsTypePromotion(qc, canonicalId, bucket);

      const additionalProps: Array<{
        "@type": string;
        propertyID: string;
        value: unknown;
      }> = [
        {
          "@type": "PropertyValue",
          propertyID: "app:bucket",
          value: bucket,
        },
      ];
      if (effectiveProjectId) {
        additionalProps.push({
          "@type": "PropertyValue",
          propertyID: "app:projectRefs",
          value: [effectiveProjectId],
        });
      }

      const patch: Record<string, unknown> = {
        additionalProperty: additionalProps,
      };
      if (needsPromotion) {
        patch["@type"] = targetTypeForBucket(bucket);
      }
      return ItemsApi.update(itemId, patch);
    },
    onMutate: async ({ canonicalId, bucket, projectId }) => {
      const itemId = findItemId(qc, canonicalId);
      const needsPromotion = needsTypePromotion(qc, canonicalId, bucket);
      const doSplit = shouldSplitOnTriage(qc, canonicalId, bucket);
      const record = doSplit ? findRecord(qc, canonicalId) : undefined;
      const actionItem =
        doSplit && record
          ? (() => {
              const item = fromJsonLd(record);
              return isActionItem(item) ? item : undefined;
            })()
          : undefined;

      if (itemId)
        savedMeta.current.set(canonicalId, {
          itemId,
          needsPromotion,
          shouldSplit: doSplit,
          record,
          actionItem,
          projectId,
        });

      const prev = await snapshotActive(qc);

      if (doSplit && record) {
        // Inject projectId so optimistic reference gets it
        const itemWithProject =
          projectId && actionItem
            ? { ...actionItem, projectIds: [projectId] }
            : actionItem;
        // Optimistically add a reference record to the cache
        const refJsonLd =
          itemWithProject &&
          buildNewFileReferenceJsonLd(itemWithProject, record);
        if (refJsonLd) {
          const now = new Date().toISOString();
          const optimisticRef: ItemRecord = {
            item_id: `temp-ref-${Date.now()}`,
            canonical_id: refJsonLd["@id"] as string,
            source: "auto-split",
            item: refJsonLd,
            created_at: now,
            updated_at: now,
          };
          addToCache(qc, ACTIVE_KEY, optimisticRef);
        }
        // Promote type to ReadAction
        promoteTypeInCache(qc, canonicalId, "ReadAction");
      }

      updateBucketInCache(qc, canonicalId, bucket);
      if (!doSplit && needsPromotion) {
        promoteTypeInCache(qc, canonicalId, targetTypeForBucket(bucket));
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: async (_data, _err, { canonicalId }) => {
      savedMeta.current.delete(canonicalId);
      await qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
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
      const itemId = findItemId(qc, canonicalId);
      if (!itemId) throw new Error(`Item not found: ${canonicalId}`);

      return ItemsApi.update(itemId, patch);
    },
    onMutate: async ({ canonicalId, patch }) => {
      const prev = await snapshotActive(qc);
      qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) =>
        old?.map((r) => {
          if (r.canonical_id !== canonicalId) return r;
          const merged = { ...r.item, ...patch };
          // Merge additionalProperty by propertyID (matching backend _deep_merge)
          if (Array.isArray(patch.additionalProperty)) {
            const byId = new Map<string, unknown>();
            for (const pv of (r.item.additionalProperty as AdditionalProp[]) ??
              []) {
              if (pv.propertyID) byId.set(pv.propertyID, pv);
            }
            for (const pv of patch.additionalProperty as AdditionalProp[]) {
              if ((pv as AdditionalProp).propertyID)
                byId.set((pv as AdditionalProp).propertyID, pv);
            }
            merged.additionalProperty = Array.from(byId.values());
          }
          return { ...r, item: merged };
        }),
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
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
      bucket: ActionItemBucket;
    }) => {
      const jsonLd = buildNewActionJsonLd(title, bucket);
      return ItemsApi.create(jsonLd, "manual");
    },
    onMutate: async ({ title, bucket }) => {
      const prev = await snapshotActive(qc);
      const now = new Date().toISOString();
      const optimistic: ItemRecord = {
        item_id: `temp-${Date.now()}`,
        canonical_id: `urn:app:action:temp-${Date.now()}` as CanonicalId,
        source: "manual",
        item: buildNewActionJsonLd(title, bucket),
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
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
      return ItemsApi.create(jsonLd, "manual");
    },
    onMutate: async (title) => {
      const prev = await snapshotActive(qc);
      const now = new Date().toISOString();
      const optimistic: ItemRecord = {
        item_id: `temp-${Date.now()}`,
        canonical_id: `urn:app:ref:temp-${Date.now()}`,
        source: "manual",
        item: buildNewReferenceJsonLd(title),
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
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
      return ItemsApi.create(jsonLd, "manual");
    },
    onMutate: async ({ projectId, title }) => {
      const prev = await snapshotActive(qc);
      const now = new Date().toISOString();
      const optimistic: ItemRecord = {
        item_id: `temp-${Date.now()}`,
        canonical_id: `urn:app:action:temp-${Date.now()}` as CanonicalId,
        source: "manual",
        item: buildNewActionJsonLd(title, "next", { projectId }),
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
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
      return ItemsApi.create(jsonLd, "manual");
    },
    onMutate: async ({ name, desiredOutcome }) => {
      const prev = await snapshotActive(qc);
      const now = new Date().toISOString();
      const optimistic: ItemRecord = {
        item_id: `temp-${Date.now()}`,
        canonical_id: `urn:app:project:temp-${Date.now()}` as CanonicalId,
        source: "manual",
        item: buildNewProjectJsonLd(name, desiredOutcome),
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<ItemRecord[]>(ACTIVE_KEY, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(ACTIVE_KEY, context.prev);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
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
      const itemId =
        savedIds.current.get(canonicalId) ?? findItemId(qc, canonicalId);
      if (!itemId) throw new Error(`Item not found: ${canonicalId}`);

      return ItemsApi.archive(itemId);
    },
    onMutate: async (canonicalId) => {
      const itemId = findItemId(qc, canonicalId);
      if (itemId) savedIds.current.set(canonicalId, itemId);

      const record = findRecord(qc, canonicalId);
      const { prevActive, prevCompleted } = await snapshotBoth(qc);
      removeFromCache(qc, canonicalId);
      // Optimistically show in Archived section
      if (record) {
        addToCache(qc, COMPLETED_KEY, {
          ...record,
          item: { ...record.item, endTime: new Date().toISOString() },
        });
      }
      return { prevActive, prevCompleted };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevActive) qc.setQueryData(ACTIVE_KEY, context.prevActive);
      if (context?.prevCompleted)
        qc.setQueryData(COMPLETED_KEY, context.prevCompleted);
    },
    onSettled: async (_data, _err, canonicalId) => {
      savedIds.current.delete(canonicalId);
      // Only invalidate active partition — archive optimistically adds to
      // COMPLETED_KEY which we want to preserve until next completed refresh.
      await qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}
