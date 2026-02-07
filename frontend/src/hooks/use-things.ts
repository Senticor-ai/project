import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ThingsApi } from "@/lib/api-client";
import type { ThingRecord } from "@/lib/api-client";
import { fromJsonLd } from "@/lib/thing-serializer";
import type {
  InboxItem,
  Action,
  Project,
  ReferenceMaterial,
} from "@/model/gtd-types";

// ---------------------------------------------------------------------------
// Shared query key + fetcher
// ---------------------------------------------------------------------------

export const THINGS_QUERY_KEY = ["things"] as const;

const SYNC_PAGE_SIZE = 5000;

async function fetchAllThings(): Promise<ThingRecord[]> {
  const all: ThingRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await ThingsApi.sync({ limit: SYNC_PAGE_SIZE, cursor });
    all.push(...page.items);
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);

  return all;
}

// ---------------------------------------------------------------------------
// Base hook: raw ThingRecords
// ---------------------------------------------------------------------------

export function useThings() {
  return useQuery({
    queryKey: THINGS_QUERY_KEY,
    queryFn: fetchAllThings,
  });
}

// ---------------------------------------------------------------------------
// Derived hooks: filter + deserialize by @type
// ---------------------------------------------------------------------------

export function useInboxItems() {
  const query = useThings();
  const items = useMemo<InboxItem[]>(
    () =>
      query.data
        ?.filter((r) => r.thing["@type"] === "gtd:InboxItem")
        .map((r) => fromJsonLd(r) as InboxItem) ?? [],
    [query.data],
  );
  return { ...query, data: items };
}

export function useActions() {
  const query = useThings();
  const items = useMemo<Action[]>(
    () =>
      query.data
        ?.filter((r) => r.thing["@type"] === "gtd:Action")
        .map((r) => fromJsonLd(r) as Action) ?? [],
    [query.data],
  );
  return { ...query, data: items };
}

export function useProjects() {
  const query = useThings();
  const items = useMemo<Project[]>(
    () =>
      query.data
        ?.filter((r) => r.thing["@type"] === "gtd:Project")
        .map((r) => fromJsonLd(r) as Project) ?? [],
    [query.data],
  );
  return { ...query, data: items };
}

export function useReferences() {
  const query = useThings();
  const items = useMemo<ReferenceMaterial[]>(
    () =>
      query.data
        ?.filter((r) => r.thing["@type"] === "gtd:Reference")
        .map((r) => fromJsonLd(r) as ReferenceMaterial) ?? [],
    [query.data],
  );
  return { ...query, data: items };
}
