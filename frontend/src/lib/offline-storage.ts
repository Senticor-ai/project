import { get, set, del } from "idb-keyval";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";
import type { QueryClient } from "@tanstack/react-query";

export const IDB_KEY = "tay-query-cache";

/**
 * Creates an IDB-backed persister for TanStack Query.
 * All errors are silently caught for graceful degradation
 * (e.g. private browsing, storage quota exceeded).
 */
export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(IDB_KEY, client);
      } catch {
        // Silently ignore — persistence is best-effort
      }
    },
    restoreClient: async () => {
      try {
        return (await get<PersistedClient>(IDB_KEY)) ?? undefined;
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await del(IDB_KEY);
      } catch {
        // Silently ignore
      }
    },
  };
}

/**
 * Clears all local PWA caches: IDB query cache, Workbox runtime caches,
 * and in-memory TanStack Query state. Server data is not affected.
 */
export async function clearAllLocalCaches(queryClient: QueryClient): Promise<{
  queriesCleared: number;
  cachesCleared: string[];
}> {
  // Read count before clearing (for summary)
  let queriesCleared = 0;
  try {
    const persisted = await get<PersistedClient>(IDB_KEY);
    queriesCleared = persisted?.clientState?.queries?.length ?? 0;
  } catch {
    /* ignore */
  }

  // Clear IDB persisted cache
  await del(IDB_KEY);

  // Clear Workbox runtime caches
  const cachesCleared: string[] = [];
  if ("caches" in globalThis && globalThis.caches) {
    try {
      const names = await globalThis.caches.keys();
      for (const name of names) {
        await globalThis.caches.delete(name);
        cachesCleared.push(name);
      }
    } catch {
      /* ignore */
    }
  }

  // Reset in-memory TanStack Query cache
  queryClient.clear();

  return { queriesCleared, cachesCleared };
}
