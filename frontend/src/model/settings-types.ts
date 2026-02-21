import type { Bucket } from "./types";

// ---------------------------------------------------------------------------
// Language & Regional
// ---------------------------------------------------------------------------

export type Language = "de" | "en";
export type TimeFormat = "24h" | "12h";
export type DateFormat = "DD.MM.YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY";
export type WeekStart = "monday" | "sunday";

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export type ThemePreference = "light" | "system" | "dark";

// ---------------------------------------------------------------------------
// User Preferences
// ---------------------------------------------------------------------------

export interface UserPreferences {
  language: Language;
  timeFormat: TimeFormat;
  dateFormat: DateFormat;
  weekStart: WeekStart;
  defaultBucket: Bucket;
  theme: ThemePreference;
  weeklyReviewEnabled: boolean;
  weeklyReviewDay: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: "de",
  timeFormat: "24h",
  dateFormat: "DD.MM.YYYY",
  weekStart: "monday",
  defaultBucket: "inbox",
  theme: "light",
  weeklyReviewEnabled: false,
  weeklyReviewDay: "sunday",
};

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

export type ImportSourceId = "native" | "nirvana";

export interface ExportOptions {
  includeArchived: boolean;
  includeCompleted: boolean;
}

export interface ImportSource {
  id: ImportSourceId;
  name: string;
  icon: string;
  description: string;
}

export const IMPORT_SOURCES: ImportSource[] = [
  {
    id: "native",
    name: "project",
    icon: "swap_horiz",
    description: "Import from a project JSON export",
  },
  {
    id: "nirvana",
    name: "Nirvana",
    icon: "cloud_download",
    description: "Import from NirvanaHQ JSON export",
  },
];
