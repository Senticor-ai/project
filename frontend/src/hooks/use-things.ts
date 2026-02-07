import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ThingsApi } from "@/lib/api-client";
import type { ThingRecord } from "@/lib/api-client";
import { fromJsonLd } from "@/lib/thing-serializer";
import type { Thing, Project, ReferenceMaterial } from "@/model/types";
import { isThing } from "@/model/types";

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
// Derived hooks: filter + deserialize
// ---------------------------------------------------------------------------

/** All Things (inbox + action buckets). */
export function useAllThings() {
  const query = useThings();
  const items = useMemo<Thing[]>(
    () =>
      query.data
        ?.filter(
          (r) =>
            r.thing["@type"] === "Thing" ||
            r.thing["@type"] === "Action",
        )
        .map((r) => {
          const item = fromJsonLd(r);
          return isThing(item) ? item : undefined;
        })
        .filter((x): x is Thing => x !== undefined) ?? [],
    [query.data],
  );
  return { ...query, data: items };
}

/** Things with bucket="inbox". */
export function useInboxItems() {
  const query = useAllThings();
  const items = useMemo<Thing[]>(
    () => query.data.filter((t) => t.bucket === "inbox"),
    [query.data],
  );
  return { ...query, data: items };
}

/** Things with action buckets (next, waiting, calendar, someday). */
export function useActions() {
  const query = useAllThings();
  const items = useMemo<Thing[]>(
    () => query.data.filter((t) => t.bucket !== "inbox"),
    [query.data],
  );
  return { ...query, data: items };
}

export function useProjects() {
  const query = useThings();
  const items = useMemo<Project[]>(
    () =>
      query.data
        ?.filter((r) => r.thing["@type"] === "Project")
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
        ?.filter((r) => r.thing["@type"] === "CreativeWork")
        .map((r) => fromJsonLd(r) as ReferenceMaterial) ?? [],
    [query.data],
  );
  return { ...query, data: items };
}
