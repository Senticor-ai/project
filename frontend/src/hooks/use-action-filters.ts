import { useState, useCallback, useMemo } from "react";
import type { EnergyLevel, TimeEstimate } from "@/model/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionFilterState {
  selectedContexts: string[];
  selectedEnergy: EnergyLevel | null;
  maxTimeEstimate: TimeEstimate | null;
}

export interface UseActionFiltersReturn extends ActionFilterState {
  toggleContext: (ctx: string) => void;
  clearContexts: () => void;
  setEnergy: (level: EnergyLevel | null) => void;
  setMaxTime: (estimate: TimeEstimate | null) => void;
  clearAll: () => void;
  hasActiveFilters: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "action-filters:";

function storageKey(bucket: string): string {
  return `${STORAGE_PREFIX}${bucket}`;
}

const EMPTY_STATE: ActionFilterState = {
  selectedContexts: [],
  selectedEnergy: null,
  maxTimeEstimate: null,
};

function loadState(bucket: string): ActionFilterState {
  try {
    const raw = sessionStorage.getItem(storageKey(bucket));
    if (!raw) return { ...EMPTY_STATE, selectedContexts: [] };
    return JSON.parse(raw) as ActionFilterState;
  } catch {
    return { ...EMPTY_STATE, selectedContexts: [] };
  }
}

function saveState(bucket: string, state: ActionFilterState): void {
  try {
    sessionStorage.setItem(storageKey(bucket), JSON.stringify(state));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useActionFilters(bucket: string): UseActionFiltersReturn {
  const [state, setState] = useState<ActionFilterState>(() => loadState(bucket));
  const [prevBucket, setPrevBucket] = useState(bucket);

  // Derived-state pattern: detect bucket change during render (no useEffect)
  if (prevBucket !== bucket) {
    // Save current state for the old bucket
    saveState(prevBucket, state);
    // Load state for the new bucket
    const newState = loadState(bucket);
    setPrevBucket(bucket);
    setState(newState);
  }

  const update = useCallback(
    (updater: (prev: ActionFilterState) => ActionFilterState) => {
      setState((prev) => {
        const next = updater(prev);
        saveState(bucket, next);
        return next;
      });
    },
    [bucket],
  );

  const toggleContext = useCallback(
    (ctx: string) =>
      update((prev) => ({
        ...prev,
        selectedContexts: prev.selectedContexts.includes(ctx)
          ? prev.selectedContexts.filter((c) => c !== ctx)
          : [...prev.selectedContexts, ctx],
      })),
    [update],
  );

  const clearContexts = useCallback(
    () => update((prev) => ({ ...prev, selectedContexts: [] })),
    [update],
  );

  const setEnergy = useCallback(
    (level: EnergyLevel | null) =>
      update((prev) => ({ ...prev, selectedEnergy: level })),
    [update],
  );

  const setMaxTime = useCallback(
    (estimate: TimeEstimate | null) =>
      update((prev) => ({ ...prev, maxTimeEstimate: estimate })),
    [update],
  );

  const clearAll = useCallback(
    () =>
      update(() => ({
        selectedContexts: [],
        selectedEnergy: null,
        maxTimeEstimate: null,
      })),
    [update],
  );

  const hasActiveFilters = useMemo(
    () =>
      state.selectedContexts.length > 0 ||
      state.selectedEnergy !== null ||
      state.maxTimeEstimate !== null,
    [state.selectedContexts, state.selectedEnergy, state.maxTimeEstimate],
  );

  return {
    selectedContexts: state.selectedContexts,
    selectedEnergy: state.selectedEnergy,
    maxTimeEstimate: state.maxTimeEstimate,
    toggleContext,
    clearContexts,
    setEnergy,
    setMaxTime,
    clearAll,
    hasActiveFilters,
  };
}
