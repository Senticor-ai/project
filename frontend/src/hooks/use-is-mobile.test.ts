import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useIsMobile } from "./use-is-mobile";

describe("useIsMobile", () => {
  let listeners: Array<() => void>;
  let matchesValue: boolean;

  beforeEach(() => {
    listeners = [];
    matchesValue = false;

    window.matchMedia = vi.fn().mockImplementation(() => ({
      get matches() {
        return matchesValue;
      },
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener: (_: string, cb: () => void) => {
        listeners.push(cb);
      },
      removeEventListener: (_: string, cb: () => void) => {
        listeners = listeners.filter((l) => l !== cb);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when viewport is at or above 768px", () => {
    matchesValue = false;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when viewport is below 768px", () => {
    matchesValue = true;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("re-renders when crossing the breakpoint", () => {
    matchesValue = false;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate crossing below 768px
    matchesValue = true;
    act(() => {
      for (const listener of listeners) listener();
    });
    expect(result.current).toBe(true);
  });

  it("cleans up listener on unmount", () => {
    matchesValue = false;
    const { unmount } = renderHook(() => useIsMobile());
    expect(listeners).toHaveLength(1);

    unmount();
    expect(listeners).toHaveLength(0);
  });
});
