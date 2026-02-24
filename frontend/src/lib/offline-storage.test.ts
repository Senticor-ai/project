import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

import { get, set, del } from "idb-keyval";
import { createIdbPersister, clearAllLocalCaches } from "./offline-storage";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

const mocked = {
  get: vi.mocked(get),
  set: vi.mocked(set),
  del: vi.mocked(del),
};

function createMockQueryClient() {
  return {
    clear: vi.fn(),
  } as unknown as import("@tanstack/react-query").QueryClient;
}

describe("createIdbPersister", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persistClient stores the client in IDB", async () => {
    mocked.set.mockResolvedValue(undefined);
    const persister = createIdbPersister();
    const client = {
      clientState: { queries: [], mutations: [] },
    } as unknown as PersistedClient;

    await persister.persistClient(client);

    expect(mocked.set).toHaveBeenCalledWith("copilot-query-cache", client);
  });

  it("persistClient silently ignores errors", async () => {
    mocked.set.mockRejectedValue(new Error("Quota exceeded"));
    const persister = createIdbPersister();
    const client = {
      clientState: { queries: [], mutations: [] },
    } as unknown as PersistedClient;

    await expect(persister.persistClient(client)).resolves.toBeUndefined();
  });

  it("restoreClient returns persisted data from IDB", async () => {
    const stored = {
      clientState: { queries: [{ queryKey: ["x"] }], mutations: [] },
    } as unknown as PersistedClient;
    mocked.get.mockResolvedValue(stored);
    const persister = createIdbPersister();

    const result = await persister.restoreClient();

    expect(mocked.get).toHaveBeenCalledWith("copilot-query-cache");
    expect(result).toBe(stored);
  });

  it("restoreClient returns undefined when nothing stored", async () => {
    mocked.get.mockResolvedValue(undefined);
    const persister = createIdbPersister();

    const result = await persister.restoreClient();

    expect(result).toBeUndefined();
  });

  it("restoreClient returns undefined on IDB error", async () => {
    mocked.get.mockRejectedValue(new Error("IDB unavailable"));
    const persister = createIdbPersister();

    const result = await persister.restoreClient();

    expect(result).toBeUndefined();
  });

  it("removeClient deletes the IDB key", async () => {
    mocked.del.mockResolvedValue(undefined);
    const persister = createIdbPersister();

    await persister.removeClient();

    expect(mocked.del).toHaveBeenCalledWith("copilot-query-cache");
  });

  it("removeClient silently ignores errors", async () => {
    mocked.del.mockRejectedValue(new Error("IDB broken"));
    const persister = createIdbPersister();

    await expect(persister.removeClient()).resolves.toBeUndefined();
  });
});

describe("clearAllLocalCaches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes IDB key, clears caches, and clears queryClient", async () => {
    mocked.get.mockResolvedValue({
      clientState: { queries: [{ queryKey: ["a"] }], mutations: [] },
    });
    mocked.del.mockResolvedValue(undefined);

    Object.defineProperty(globalThis, "caches", {
      value: {
        keys: vi.fn().mockResolvedValue(["items-sync", "workbox-precache"]),
        delete: vi.fn().mockResolvedValue(true),
      },
      configurable: true,
    });

    const qc = createMockQueryClient();
    const result = await clearAllLocalCaches(qc);

    expect(mocked.del).toHaveBeenCalledWith("copilot-query-cache");
    expect(globalThis.caches.delete).toHaveBeenCalledWith("items-sync");
    expect(globalThis.caches.delete).toHaveBeenCalledWith("workbox-precache");
    expect(qc.clear).toHaveBeenCalledOnce();
    expect(result.queriesCleared).toBe(1);
    expect(result.cachesCleared).toEqual(["items-sync", "workbox-precache"]);
  });

  it("handles missing caches API gracefully", async () => {
    mocked.get.mockResolvedValue(undefined);
    mocked.del.mockResolvedValue(undefined);

    Object.defineProperty(globalThis, "caches", {
      value: undefined,
      configurable: true,
    });

    const qc = createMockQueryClient();
    const result = await clearAllLocalCaches(qc);

    expect(result.queriesCleared).toBe(0);
    expect(result.cachesCleared).toEqual([]);
    expect(qc.clear).toHaveBeenCalledOnce();
  });

  it("succeeds even if IDB read fails", async () => {
    mocked.get.mockRejectedValue(new Error("IDB broken"));
    mocked.del.mockResolvedValue(undefined);

    Object.defineProperty(globalThis, "caches", {
      value: undefined,
      configurable: true,
    });

    const qc = createMockQueryClient();
    const result = await clearAllLocalCaches(qc);

    expect(result.queriesCleared).toBe(0);
    expect(mocked.del).toHaveBeenCalled();
    expect(qc.clear).toHaveBeenCalledOnce();
  });
});
