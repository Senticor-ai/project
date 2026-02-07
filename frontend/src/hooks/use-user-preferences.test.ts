import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUserPreferences } from "./use-user-preferences";
import { DEFAULT_PREFERENCES } from "@/model/settings-types";

const STORAGE_KEY = "tay-user-preferences";

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

describe("useUserPreferences", () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns default preferences when localStorage is empty", () => {
    const { result } = renderHook(() => useUserPreferences());
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it("reads stored preferences from localStorage", () => {
    store.set(
      STORAGE_KEY,
      JSON.stringify({ language: "en", timeFormat: "12h" }),
    );
    const { result } = renderHook(() => useUserPreferences());
    expect(result.current.preferences.language).toBe("en");
    expect(result.current.preferences.timeFormat).toBe("12h");
    expect(result.current.preferences.dateFormat).toBe("DD.MM.YYYY");
  });

  it("updates preferences with partial values", () => {
    const { result } = renderHook(() => useUserPreferences());
    act(() => {
      result.current.updatePreferences({ language: "en" });
    });
    expect(result.current.preferences.language).toBe("en");
    expect(result.current.preferences.timeFormat).toBe("24h");
  });

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() => useUserPreferences());
    act(() => {
      result.current.updatePreferences({ theme: "dark" });
    });
    const stored = JSON.parse(store.get(STORAGE_KEY)!);
    expect(stored.theme).toBe("dark");
  });

  it("handles corrupted localStorage gracefully", () => {
    store.set(STORAGE_KEY, "not-valid-json");
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useUserPreferences());
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
    consoleSpy.mockRestore();
  });
});
