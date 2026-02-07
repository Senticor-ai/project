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
    className: "bg-gtd-inbox/15 text-gtd-inbox",
  },
  next: {
    label: "Next",
    icon: "bolt",
    className: "bg-gtd-next/15 text-gtd-next",
  },
  project: {
    label: "Project",
    icon: "folder",
    className: "bg-gtd-project/15 text-gtd-project",
  },
  waiting: {
    label: "Waiting",
    icon: "schedule",
    className: "bg-gtd-waiting/15 text-gtd-waiting",
  },
  someday: {
    label: "Someday",
    icon: "cloud",
    className: "bg-gtd-someday/15 text-gtd-someday",
  },
  calendar: {
    label: "Calendar",
    icon: "calendar_month",
    className: "bg-gtd-calendar/15 text-gtd-calendar",
  },
  reference: {
    label: "Reference",
    icon: "book",
    className: "bg-gtd-reference/15 text-gtd-reference",
  },
  focus: {
    label: "Focus",
    icon: "center_focus_strong",
    className: "bg-gtd-focus/15 text-gtd-focus",
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
