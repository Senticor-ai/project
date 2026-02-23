import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("idb-keyval", () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

import { get } from "idb-keyval";
import { usePwaStorageStats } from "./use-pwa-storage-stats";

const mocked = { get: vi.mocked(get) };

describe("usePwaStorageStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns loading=true initially, then resolves with stats", async () => {
    // Mock navigator.storage
    Object.defineProperty(navigator, "storage", {
      value: {
        estimate: vi.fn().mockResolvedValue({ usage: 5000, quota: 1_000_000 }),
      },
      configurable: true,
    });

    // Mock caches API
    Object.defineProperty(globalThis, "caches", {
      value: { keys: vi.fn().mockResolvedValue(["items-sync"]) },
      configurable: true,
    });

    // Mock service worker
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        getRegistrations: vi
          .fn()
          .mockResolvedValue([{ active: { state: "activated" } }]),
      },
      configurable: true,
    });

    // Mock IDB persisted client
    mocked.get.mockResolvedValue({
      clientState: {
        queries: [{ queryKey: ["a"] }, { queryKey: ["b"] }],
        mutations: [],
      },
    });

    const { result } = renderHook(() => usePwaStorageStats());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.originUsage).toBe(5000);
    expect(result.current.originQuota).toBe(1_000_000);
    expect(result.current.cachedQueryCount).toBe(2);
    expect(result.current.queryCacheSize).toBeGreaterThan(0);
    expect(result.current.cacheNames).toEqual(["items-sync"]);
    expect(result.current.serviceWorkerActive).toBe(true);
  });

  it("handles missing navigator.storage gracefully", async () => {
    Object.defineProperty(navigator, "storage", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(globalThis, "caches", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
    mocked.get.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePwaStorageStats());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.originUsage).toBeNull();
    expect(result.current.originQuota).toBeNull();
    expect(result.current.cacheNames).toEqual([]);
    expect(result.current.serviceWorkerActive).toBe(false);
  });

  it("counts queries from persisted IDB client", async () => {
    Object.defineProperty(navigator, "storage", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(globalThis, "caches", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });

    mocked.get.mockResolvedValue({
      clientState: {
        queries: Array.from({ length: 50 }, (_, i) => ({
          queryKey: [`q${i}`],
        })),
        mutations: [],
      },
    });

    const { result } = renderHook(() => usePwaStorageStats());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.cachedQueryCount).toBe(50);
  });

  it("refresh() re-reads stats and sets loading while doing so", async () => {
    Object.defineProperty(navigator, "storage", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(globalThis, "caches", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
    mocked.get.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePwaStorageStats());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // After initial load, cachedQueryCount is null
    expect(result.current.cachedQueryCount).toBeNull();

    // Set up new mock data for refresh
    mocked.get.mockResolvedValue({
      clientState: {
        queries: [{ queryKey: ["refreshed"] }],
        mutations: [],
      },
    });

    // Call refresh inside act to flush state updates
    act(() => {
      result.current.refresh();
    });

    // Wait for refresh to complete with new data
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.cachedQueryCount).toBe(1);
  });

  it("handles IDB read failure gracefully", async () => {
    Object.defineProperty(navigator, "storage", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(globalThis, "caches", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
    mocked.get.mockRejectedValue(new Error("IDB unavailable"));

    const { result } = renderHook(() => usePwaStorageStats());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.cachedQueryCount).toBeNull();
    expect(result.current.queryCacheSize).toBeNull();
  });
});
