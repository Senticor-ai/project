import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useActionFilters } from "./use-action-filters";

describe("useActionFilters", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("returns default state with no active filters", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    expect(result.current.selectedContexts).toEqual([]);
    expect(result.current.selectedEnergy).toBeNull();
    expect(result.current.maxTimeEstimate).toBeNull();
    expect(result.current.hasActiveFilters).toBe(false);
  });

  // --- Context filters ---

  it("toggleContext adds and removes a context", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    act(() => result.current.toggleContext("@phone"));
    expect(result.current.selectedContexts).toEqual(["@phone"]);
    expect(result.current.hasActiveFilters).toBe(true);

    act(() => result.current.toggleContext("@phone"));
    expect(result.current.selectedContexts).toEqual([]);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("supports multiple selected contexts", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    act(() => {
      result.current.toggleContext("@phone");
      result.current.toggleContext("@computer");
    });
    expect(result.current.selectedContexts).toEqual(["@phone", "@computer"]);
  });

  it("clearContexts removes all contexts", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    act(() => {
      result.current.toggleContext("@phone");
      result.current.toggleContext("@home");
    });
    act(() => result.current.clearContexts());
    expect(result.current.selectedContexts).toEqual([]);
  });

  // --- Energy filter ---

  it("setEnergy sets and clears energy level", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    act(() => result.current.setEnergy("low"));
    expect(result.current.selectedEnergy).toBe("low");
    expect(result.current.hasActiveFilters).toBe(true);

    act(() => result.current.setEnergy(null));
    expect(result.current.selectedEnergy).toBeNull();
  });

  // --- Time estimate filter ---

  it("setMaxTime sets and clears time estimate", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    act(() => result.current.setMaxTime("30min"));
    expect(result.current.maxTimeEstimate).toBe("30min");
    expect(result.current.hasActiveFilters).toBe(true);

    act(() => result.current.setMaxTime(null));
    expect(result.current.maxTimeEstimate).toBeNull();
  });

  // --- clearAll ---

  it("clearAll resets all filters", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    act(() => {
      result.current.toggleContext("@phone");
      result.current.setEnergy("high");
      result.current.setMaxTime("1hr");
    });
    expect(result.current.hasActiveFilters).toBe(true);

    act(() => result.current.clearAll());
    expect(result.current.selectedContexts).toEqual([]);
    expect(result.current.selectedEnergy).toBeNull();
    expect(result.current.maxTimeEstimate).toBeNull();
    expect(result.current.hasActiveFilters).toBe(false);
  });

  // --- Session storage persistence ---

  it("persists state to sessionStorage keyed by bucket", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    act(() => {
      result.current.toggleContext("@phone");
      result.current.setEnergy("low");
    });

    // Re-mount with same bucket — state should be restored
    const { result: result2 } = renderHook(() => useActionFilters("next"));
    expect(result2.current.selectedContexts).toEqual(["@phone"]);
    expect(result2.current.selectedEnergy).toBe("low");
  });

  it("uses separate storage per bucket", () => {
    const { result: nextResult } = renderHook(() => useActionFilters("next"));
    act(() => nextResult.current.toggleContext("@phone"));

    const { result: inboxResult } = renderHook(() => useActionFilters("inbox"));
    expect(inboxResult.current.selectedContexts).toEqual([]);
  });

  // --- Type filters ---

  it("selectedTypes starts empty", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    expect(result.current.selectedTypes).toEqual([]);
  });

  it("toggleType adds a type to selectedTypes", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    act(() => result.current.toggleType("BuyAction"));
    expect(result.current.selectedTypes).toEqual(["BuyAction"]);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("toggleType removes a type when already selected", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    act(() => result.current.toggleType("BuyAction"));
    act(() => result.current.toggleType("BuyAction"));
    expect(result.current.selectedTypes).toEqual([]);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("clearAll also clears selectedTypes", () => {
    const { result } = renderHook(() => useActionFilters("next"));
    act(() => {
      result.current.toggleType("BuyAction");
      result.current.toggleContext("@phone");
    });
    act(() => result.current.clearAll());
    expect(result.current.selectedTypes).toEqual([]);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  // --- Bucket change (derived-state pattern) ---

  it("saves and restores state on bucket change", () => {
    const { result, rerender } = renderHook(
      ({ bucket }) => useActionFilters(bucket),
      { initialProps: { bucket: "next" as string } },
    );

    act(() => {
      result.current.toggleContext("@phone");
      result.current.setEnergy("high");
    });

    // Switch to inbox
    rerender({ bucket: "inbox" });
    expect(result.current.selectedContexts).toEqual([]);
    expect(result.current.selectedEnergy).toBeNull();

    // Set inbox filters
    act(() => result.current.toggleContext("@home"));

    // Switch back to next — previous state restored
    rerender({ bucket: "next" });
    expect(result.current.selectedContexts).toEqual(["@phone"]);
    expect(result.current.selectedEnergy).toBe("high");
  });
});
