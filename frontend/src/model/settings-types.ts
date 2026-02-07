import type { GtdBucket } from "./gtd-types";

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
  defaultBucket: GtdBucket;
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

export type ImportSourceId = "nirvana" | "things3" | "todoist" | "csv";
export type ExportFormat = "json" | "csv";

export interface ImportSource {
  id: ImportSourceId;
  name: string;
  icon: string;
  description: string;
  available: boolean;
}

export const IMPORT_SOURCES: ImportSource[] = [
  {
    id: "nirvana",
    name: "Nirvana",
    icon: "cloud_download",
    description: "Import from NirvanaHQ JSON export",
    available: true,
  },
  {
    id: "things3",
    name: "Things 3",
    icon: "check_circle",
    description: "Import from Things 3 JSON export",
    available: false,
  },
  {
    id: "todoist",
    name: "Todoist",
    icon: "task_alt",
    description: "Import from Todoist CSV export",
    available: false,
  },
  {
    id: "csv",
    name: "CSV",
    icon: "table_chart",
    description: "Import from generic CSV file",
    available: false,
  },
];
