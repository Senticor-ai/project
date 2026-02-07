import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ThingsApi } from "@/lib/api-client";
import type { ThingRecord } from "@/lib/api-client";
import {
  buildNewInboxJsonLd,
  buildNewReferenceJsonLd,
  buildTriagePatch,
  buildNewActionJsonLd,
} from "@/lib/thing-serializer";
import type { Thing, ThingBucket, TriageResult } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";
import { THINGS_QUERY_KEY } from "./use-things";

// ---------------------------------------------------------------------------
// Helper: find thing_id from canonical_id in the cache
// ---------------------------------------------------------------------------

function findThingId(
  cache: ThingRecord[] | undefined,
  canonicalId: CanonicalId,
): string | undefined {
  return cache?.find((r) => r.canonical_id === canonicalId)?.thing_id;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Triage inbox item → Action / Reference / Archive
// ---------------------------------------------------------------------------

export function useTriageItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      item,
      result,
    }: {
      item: Thing;
      result: TriageResult;
    }) => {
      const thingId = findThingId(
        qc.getQueryData<ThingRecord[]>(THINGS_QUERY_KEY),
        item.id,
      );
      if (!thingId) throw new Error(`Thing not found: ${item.id}`);

      if (result.targetBucket === "archive") {
        return ThingsApi.archive(thingId);
      }

      const patch = buildTriagePatch(item, result);
      return ThingsApi.update(thingId, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Complete action
// ---------------------------------------------------------------------------

export function useCompleteAction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (canonicalId: CanonicalId) => {
      const cache = qc.getQueryData<ThingRecord[]>(THINGS_QUERY_KEY);
      const record = cache?.find((r) => r.canonical_id === canonicalId);
      if (!record) throw new Error(`Thing not found: ${canonicalId}`);

      const isCompleted = !!record.thing.endDate;
      return ThingsApi.update(record.thing_id, {
        endDate: isCompleted ? null : new Date().toISOString(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Toggle focus
// ---------------------------------------------------------------------------

export function useToggleFocus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (canonicalId: CanonicalId) => {
      const cache = qc.getQueryData<ThingRecord[]>(THINGS_QUERY_KEY);
      const record = cache?.find((r) => r.canonical_id === canonicalId);
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
    onSuccess: () => {
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
      const thingId = findThingId(
        qc.getQueryData<ThingRecord[]>(THINGS_QUERY_KEY),
        canonicalId,
      );
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
    onSuccess: () => {
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
      const thingId = findThingId(
        qc.getQueryData<ThingRecord[]>(THINGS_QUERY_KEY),
        canonicalId,
      );
      if (!thingId) throw new Error(`Thing not found: ${canonicalId}`);

      return ThingsApi.update(thingId, patch);
    },
    onSuccess: () => {
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
    onSuccess: () => {
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
    onSuccess: () => {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Archive reference
// ---------------------------------------------------------------------------

export function useArchiveReference() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (canonicalId: CanonicalId) => {
      const thingId = findThingId(
        qc.getQueryData<ThingRecord[]>(THINGS_QUERY_KEY),
        canonicalId,
      );
      if (!thingId) throw new Error(`Thing not found: ${canonicalId}`);

      return ThingsApi.archive(thingId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    },
  });
}
