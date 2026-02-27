import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSwipeTriageConfig } from "./use-swipe-triage-config";

const STORAGE_KEY = "swipe-triage-config";

// Mock localStorage since jsdom's implementation is limited
const store = new Map<string, string>();
const mockStorage = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  removeItem: vi.fn((key: string) => store.delete(key)),
  clear: vi.fn(() => store.clear()),
  get length() {
    return store.size;
  },
  key: vi.fn(() => null),
};

describe("useSwipeTriageConfig", () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns default config when localStorage is empty", () => {
    const { result } = renderHook(() => useSwipeTriageConfig());
    expect(result.current).toEqual({
      swipeRight: "next",
      swipeLeft: "waiting",
    });
  });

  it("reads config from localStorage", () => {
    store.set(
      STORAGE_KEY,
      JSON.stringify({ swipeRight: "someday", swipeLeft: "calendar" }),
    );
    const { result } = renderHook(() => useSwipeTriageConfig());
    expect(result.current).toEqual({
      swipeRight: "someday",
      swipeLeft: "calendar",
    });
  });

  it("returns default when localStorage contains invalid JSON", () => {
    store.set(STORAGE_KEY, "not-valid-json");
    const { result } = renderHook(() => useSwipeTriageConfig());
    expect(result.current).toEqual({
      swipeRight: "next",
      swipeLeft: "waiting",
    });
  });

  it("returns default when localStorage value is not an object", () => {
    store.set(STORAGE_KEY, '"just a string"');
    const { result } = renderHook(() => useSwipeTriageConfig());
    expect(result.current).toEqual({
      swipeRight: "next",
      swipeLeft: "waiting",
    });
  });
});
