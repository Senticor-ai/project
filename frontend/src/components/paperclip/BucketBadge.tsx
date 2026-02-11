import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { Bucket } from "@/model/types";

const bucketConfig: Record<
  Bucket,
  { label: string; icon: string; className: string }
> = {
  inbox: {
    label: "Inbox",
    icon: "inbox",
    className: "bg-app-inbox/15 text-app-inbox",
  },
  next: {
    label: "Next",
    icon: "bolt",
    className: "bg-app-next/15 text-app-next",
  },
  project: {
    label: "Project",
    icon: "folder",
    className: "bg-app-project/15 text-app-project",
  },
  waiting: {
    label: "Waiting",
    icon: "schedule",
    className: "bg-app-waiting/15 text-app-waiting",
  },
  someday: {
    label: "Later",
    icon: "cloud",
    className: "bg-app-someday/15 text-app-someday",
  },
  calendar: {
    label: "Calendar",
    icon: "calendar_month",
    className: "bg-app-calendar/15 text-app-calendar",
  },
  reference: {
    label: "Reference",
    icon: "book",
    className: "bg-app-reference/15 text-app-reference",
  },
  focus: {
    label: "Focus",
    icon: "center_focus_strong",
    className: "bg-app-focus/15 text-app-focus",
  },
};

export interface BucketBadgeProps {
  bucket: Bucket;
  showLabel?: boolean;
  className?: string;
}

export function BucketBadge({
  bucket,
  showLabel = true,
  className,
}: BucketBadgeProps) {
  const config = bucketConfig[bucket];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        config.className,
        className,
      )}
    >
      <Icon name={config.icon} size={12} />
      {showLabel && config.label}
    </span>
  );
}
