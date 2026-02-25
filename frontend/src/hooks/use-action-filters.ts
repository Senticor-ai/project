import { useState, useCallback, useMemo } from "react";
import type { EnergyLevel, TimeEstimate } from "@/model/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionFilterState {
  selectedContexts: string[];
  selectedEnergy: EnergyLevel | null;
  maxTimeEstimate: TimeEstimate | null;
  selectedTypes: string[];
}

export interface UseActionFiltersReturn extends ActionFilterState {
  toggleContext: (ctx: string) => void;
  clearContexts: () => void;
  setEnergy: (level: EnergyLevel | null) => void;
  setMaxTime: (estimate: TimeEstimate | null) => void;
  toggleType: (type: string) => void;
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
  selectedTypes: [],
};

function loadState(bucket: string): ActionFilterState {
  try {
    const raw = sessionStorage.getItem(storageKey(bucket));
    if (!raw) return { ...EMPTY_STATE };
    const parsed = JSON.parse(raw) as Partial<ActionFilterState>;
    // Ensure selectedTypes always exists (backwards-compat with old stored state)
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return { ...EMPTY_STATE };
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
  const [state, setState] = useState<ActionFilterState>(() =>
    loadState(bucket),
  );
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

  const toggleType = useCallback(
    (type: string) =>
      update((prev) => ({
        ...prev,
        selectedTypes: prev.selectedTypes.includes(type)
          ? prev.selectedTypes.filter((t) => t !== type)
          : [...prev.selectedTypes, type],
      })),
    [update],
  );

  const clearAll = useCallback(
    () =>
      update(() => ({
        selectedContexts: [],
        selectedEnergy: null,
        maxTimeEstimate: null,
        selectedTypes: [],
      })),
    [update],
  );

  const hasActiveFilters = useMemo(
    () =>
      state.selectedContexts.length > 0 ||
      state.selectedEnergy !== null ||
      state.maxTimeEstimate !== null ||
      state.selectedTypes.length > 0,
    [
      state.selectedContexts,
      state.selectedEnergy,
      state.maxTimeEstimate,
      state.selectedTypes,
    ],
  );

  return {
    selectedContexts: state.selectedContexts,
    selectedEnergy: state.selectedEnergy,
    maxTimeEstimate: state.maxTimeEstimate,
    selectedTypes: state.selectedTypes,
    toggleContext,
    clearContexts,
    setEnergy,
    setMaxTime,
    toggleType,
    clearAll,
    hasActiveFilters,
  };
}
