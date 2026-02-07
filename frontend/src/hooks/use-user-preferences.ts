import { useState, useCallback } from "react";
import {
  type UserPreferences,
  DEFAULT_PREFERENCES,
} from "@/model/settings-types";

const STORAGE_KEY = "tay-user-preferences";

function loadPreferences(): UserPreferences {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    } catch {
      console.warn("Failed to parse stored preferences, using defaults");
    }
  }
  return DEFAULT_PREFERENCES;
}

export function useUserPreferences() {
  const [preferences, setPreferences] =
    useState<UserPreferences>(loadPreferences);

  const updatePreferences = useCallback((update: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...update };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { preferences, updatePreferences };
}
