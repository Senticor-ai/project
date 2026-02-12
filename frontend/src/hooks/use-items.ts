import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ItemsApi } from "@/lib/api-client";
import type { ItemRecord } from "@/lib/api-client";
import { fromJsonLd } from "@/lib/item-serializer";
import type { ActionItem, Project, ReferenceMaterial } from "@/model/types";
import { isActionItem } from "@/model/types";

// ---------------------------------------------------------------------------
// Shared query key + fetcher
// ---------------------------------------------------------------------------

export const ITEMS_QUERY_KEY = ["items"] as const;

const SYNC_PAGE_SIZE = 5000;

async function fetchItems(completed: string): Promise<ItemRecord[]> {
  const all: ItemRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await ItemsApi.sync({
      limit: SYNC_PAGE_SIZE,
      cursor,
      completed,
    });
    all.push(...page.items);
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);

  return all;
}

// ---------------------------------------------------------------------------
// Base hook: raw ItemRecords (active only by default)
// ---------------------------------------------------------------------------

export function useItems() {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, { completed: "false" }],
    queryFn: () => fetchItems("false"),
  });
}

/** Completed items — enabled lazily when needed. */
export function useCompletedItems(enabled: boolean) {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, { completed: "true" }],
    queryFn: () => fetchItems("true"),
    enabled,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AdditionalProp = { propertyID: string; value: unknown };

/** Extract app:bucket from an ItemRecord's additionalProperty array. */
function getBucketFromRecord(r: ItemRecord): string | undefined {
  const props = r.item.additionalProperty as AdditionalProp[] | undefined;
  return props?.find((p) => p.propertyID === "app:bucket")?.value as
    | string
    | undefined;
}

// ---------------------------------------------------------------------------
// Derived hooks: filter + deserialize
// ---------------------------------------------------------------------------

function deserializeActionItems(
  records: ItemRecord[] | undefined,
): ActionItem[] {
  return (
    records
      ?.filter((r) => {
        const type = r.item["@type"] as string;
        if (type === "Action" || type === "ReadAction") return true;
        // EmailMessage/DigitalDocument can sit in any action bucket after triage
        if (type === "EmailMessage" || type === "DigitalDocument") return true;
        // Other types (CreativeWork for URL captures) only in inbox
        return getBucketFromRecord(r) === "inbox";
      })
      .map((r) => {
        const item = fromJsonLd(r);
        return isActionItem(item) ? item : undefined;
      })
      .filter((x): x is ActionItem => x !== undefined) ?? []
  );
}

/** All ActionItems (inbox + action buckets). */
export function useAllItems() {
  const query = useItems();
  const items = useMemo<ActionItem[]>(
    () => deserializeActionItems(query.data),
    [query.data],
  );
  return { ...query, data: items };
}

/** Completed ActionItems — enabled lazily. */
export function useAllCompletedItems(enabled: boolean) {
  const query = useCompletedItems(enabled);
  const items = useMemo<ActionItem[]>(
    () => deserializeActionItems(query.data),
    [query.data],
  );
  return { ...query, data: items };
}

/** ActionItems with bucket="inbox". */
export function useInboxItems() {
  const query = useAllItems();
  const items = useMemo<ActionItem[]>(
    () => query.data.filter((t) => t.bucket === "inbox"),
    [query.data],
  );
  return { ...query, data: items };
}

/** ActionItems with action buckets (next, waiting, calendar, someday). */
export function useActions() {
  const query = useAllItems();
  const items = useMemo<ActionItem[]>(
    () => query.data.filter((t) => t.bucket !== "inbox"),
    [query.data],
  );
  return { ...query, data: items };
}

export function useProjects() {
  const query = useItems();
  const items = useMemo<Project[]>(
    () =>
      query.data
        ?.filter((r) => r.item["@type"] === "Project")
        .map((r) => fromJsonLd(r) as Project) ?? [],
    [query.data],
  );
  return { ...query, data: items };
}

export function useReferences() {
  const query = useItems();
  const items = useMemo<ReferenceMaterial[]>(
    () =>
      query.data
        ?.filter(
          (r) =>
            (r.item["@type"] === "CreativeWork" ||
              r.item["@type"] === "DigitalDocument") &&
            getBucketFromRecord(r) === "reference",
        )
        .map((r) => fromJsonLd(r) as ReferenceMaterial) ?? [],
    [query.data],
  );
  return { ...query, data: items };
}
