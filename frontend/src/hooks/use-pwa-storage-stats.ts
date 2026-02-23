import { useState, useEffect, useCallback } from "react";
import { get } from "idb-keyval";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { IDB_KEY } from "@/lib/offline-storage";

export interface PwaStorageStats {
  originUsage: number | null;
  originQuota: number | null;
  cachedQueryCount: number | null;
  queryCacheSize: number | null;
  cacheNames: string[];
  serviceWorkerActive: boolean;
  loading: boolean;
}

const INITIAL: PwaStorageStats = {
  originUsage: null,
  originQuota: null,
  cachedQueryCount: null,
  queryCacheSize: null,
  cacheNames: [],
  serviceWorkerActive: false,
  loading: true,
};

async function readStats(): Promise<Omit<PwaStorageStats, "loading">> {
  let originUsage: number | null = null;
  let originQuota: number | null = null;
  let cachedQueryCount: number | null = null;
  let queryCacheSize: number | null = null;
  let cacheNames: string[] = [];
  let serviceWorkerActive = false;

  // Origin storage estimate
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      originUsage = est.usage ?? null;
      originQuota = est.quota ?? null;
    }
  } catch {
    /* unavailable */
  }

  // IDB persisted query cache
  try {
    const persisted = await get<PersistedClient>(IDB_KEY);
    if (persisted?.clientState?.queries) {
      cachedQueryCount = persisted.clientState.queries.length;
      queryCacheSize = new Blob([JSON.stringify(persisted)]).size;
    }
  } catch {
    /* unavailable */
  }

  // Workbox runtime caches
  try {
    if ("caches" in globalThis && globalThis.caches) {
      cacheNames = await globalThis.caches.keys();
    }
  } catch {
    /* unavailable */
  }

  // Service worker status
  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      serviceWorkerActive = registrations.some((r) => r.active != null);
    }
  } catch {
    /* unavailable */
  }

  return {
    originUsage,
    originQuota,
    cachedQueryCount,
    queryCacheSize,
    cacheNames,
    serviceWorkerActive,
  };
}

/**
 * Reads browser storage stats for the PWA (origin storage, IDB cache,
 * Workbox caches, service worker status). All APIs gracefully degrade.
 */
export function usePwaStorageStats() {
  const [stats, setStats] = useState<PwaStorageStats>(INITIAL);

  const refresh = useCallback(() => {
    setStats((prev) => ({ ...prev, loading: true }));
    readStats().then((s) => setStats({ ...s, loading: false }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    readStats().then((s) => {
      if (!cancelled) setStats({ ...s, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...stats, refresh };
}
