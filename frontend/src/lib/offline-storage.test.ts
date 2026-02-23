import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

import { get, del } from "idb-keyval";
import { clearAllLocalCaches } from "./offline-storage";

const mocked = { get: vi.mocked(get), del: vi.mocked(del) };

function createMockQueryClient() {
  return {
    clear: vi.fn(),
  } as unknown as import("@tanstack/react-query").QueryClient;
}

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

    expect(mocked.del).toHaveBeenCalledWith("tay-query-cache");
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
