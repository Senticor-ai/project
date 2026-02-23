import { get, set, del } from "idb-keyval";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";

const IDB_KEY = "tay-query-cache";

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
