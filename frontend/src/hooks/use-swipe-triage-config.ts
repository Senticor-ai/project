export interface SwipeTriageConfig {
  swipeRight: string;
  swipeLeft: string;
}

const STORAGE_KEY = "swipe-triage-config";

const DEFAULT_CONFIG: SwipeTriageConfig = {
  swipeRight: "next",
  swipeLeft: "waiting",
};

/**
 * Read the swipe-triage gesture mapping from localStorage.
 *
 * MVP: returns a static config (no reactivity needed since the config
 * never changes at runtime). Future versions may expose a settings UI.
 */
export function useSwipeTriageConfig(): SwipeTriageConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "swipeRight" in parsed &&
      "swipeLeft" in parsed
    ) {
      return parsed as SwipeTriageConfig;
    }
    return DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
