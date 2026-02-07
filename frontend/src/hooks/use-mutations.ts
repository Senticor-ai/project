import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ThingsApi } from "@/lib/api-client";
import type { ThingRecord } from "@/lib/api-client";
import {
  buildNewInboxJsonLd,
  buildNewReferenceJsonLd,
  buildTriagePatch,
} from "@/lib/thing-serializer";
import type { Action, InboxItem, TriageResult } from "@/model/gtd-types";
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
      item: InboxItem;
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

      const isCompleted = !!record.thing.completedAt;
      return ThingsApi.update(record.thing_id, {
        completedAt: isCompleted ? null : new Date().toISOString(),
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

      return ThingsApi.update(record.thing_id, {
        isFocused: !record.thing.isFocused,
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

      return ThingsApi.update(thingId, { bucket });
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
      bucket: Action["bucket"];
    }) => {
      const jsonLd = buildNewInboxJsonLd(title);
      jsonLd["@type"] = "gtd:Action";
      jsonLd.bucket = bucket;
      jsonLd.isFocused = false;
      jsonLd.contexts = [];
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
      const jsonLd = buildNewInboxJsonLd(title);
      jsonLd["@type"] = "gtd:Action";
      jsonLd.bucket = "next";
      jsonLd.isFocused = false;
      jsonLd.contexts = [];
      jsonLd.projectId = projectId;
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
