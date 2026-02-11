import type { Bucket } from "@/model/types";

export interface BucketNavItemConfig {
  bucket: Bucket;
  label: string;
  icon: string;
}

export const navItems: BucketNavItemConfig[] = [
  { bucket: "inbox", label: "Inbox", icon: "inbox" },
  { bucket: "focus", label: "Focus", icon: "center_focus_strong" },
  { bucket: "next", label: "Next", icon: "bolt" },
  { bucket: "project", label: "Projects", icon: "folder" },
  { bucket: "waiting", label: "Waiting", icon: "schedule" },
  { bucket: "calendar", label: "Calendar", icon: "calendar_month" },
  { bucket: "someday", label: "Later", icon: "cloud" },
  { bucket: "reference", label: "Reference", icon: "book" },
];
