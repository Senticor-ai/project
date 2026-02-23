import type { Bucket } from "@/model/types";

export type AppView = "workspace" | "settings";
export type SettingsTab =
  | "import-export"
  | "email"
  | "labels"
  | "organizations"
  | "preferences"
  | "agent-setup"
  | "developer";

export interface LocationState {
  view: AppView;
  sub: string;
}

const VALID_BUCKETS = new Set<string>([
  "inbox",
  "focus",
  "next",
  "project",
  "waiting",
  "calendar",
  "someday",
  "reference",
]);

const VALID_SETTINGS_TABS = new Set<string>([
  "import-export",
  "email",
  "labels",
  "organizations",
  "preferences",
  "agent-setup",
  "developer",
]);

const DEFAULT_BUCKET = "inbox";
const DEFAULT_SETTINGS_TAB = "import-export";

export function isValidBucket(s: string): s is Bucket {
  return VALID_BUCKETS.has(s);
}

export function isValidSettingsTab(s: string): s is SettingsTab {
  return VALID_SETTINGS_TABS.has(s);
}

export function parsePathname(pathname: string): LocationState {
  const segments = pathname.split("/").filter(Boolean);
  const view = segments[0];
  const sub = segments[1];

  if (view === "workspace") {
    return {
      view: "workspace",
      sub: sub && isValidBucket(sub) ? sub : DEFAULT_BUCKET,
    };
  }

  if (view === "settings") {
    return {
      view: "settings",
      sub: sub && isValidSettingsTab(sub) ? sub : DEFAULT_SETTINGS_TAB,
    };
  }

  return { view: "workspace", sub: DEFAULT_BUCKET };
}

export function buildPath(view: AppView, sub: string): string {
  return `/${view}/${sub}`;
}
