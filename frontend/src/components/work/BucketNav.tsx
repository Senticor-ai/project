import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { navItems } from "./bucket-nav-items";
import type { Bucket } from "@/model/types";

// Drop targets: buckets where items can be dragged to
const droppableBuckets = new Set<string>([
  "focus",
  "next",
  "waiting",
  "calendar",
  "someday",
  "reference",
]);

export interface BucketNavProps {
  activeBucket: Bucket;
  onSelect: (bucket: Bucket) => void;
  counts?: Partial<Record<Bucket, number>>;
  className?: string;
}

function BucketNavItem({
  bucket,
  label,
  icon,
  isActive,
  count,
  onSelect,
}: {
  bucket: Bucket;
  label: string;
  icon: string;
  isActive: boolean;
  count: number | undefined;
  onSelect: () => void;
}) {
  const isDropTarget = droppableBuckets.has(bucket);
  const { setNodeRef, isOver } = useDroppable({
    id: `bucket-${bucket}`,
    data: { bucket },
    disabled: !isDropTarget,
  });

  return (
    <button
      ref={setNodeRef}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm",
        "transition-colors duration-[var(--duration-fast)]",
        isActive
          ? "bg-blueprint-50 font-medium text-blueprint-700"
          : "text-text-muted hover:bg-paper-100 hover:text-text",
        isOver && "ring-2 ring-blueprint-300 bg-blueprint-50/50",
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon name={icon} size={16} className="shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {count != null && count > 0 && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            isActive
              ? "bg-blueprint-100 text-blueprint-700"
              : "bg-paper-200 text-text-subtle",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function BucketNav({
  activeBucket,
  onSelect,
  counts = {},
  className,
}: BucketNavProps) {
  return (
    <nav className={cn("space-y-0.5", className)} aria-label="Buckets">
      {navItems.map(({ bucket, label, icon }) => (
        <BucketNavItem
          key={bucket}
          bucket={bucket}
          label={label}
          icon={icon}
          isActive={activeBucket === bucket}
          count={counts[bucket]}
          onSelect={() => onSelect(bucket)}
        />
      ))}
    </nav>
  );
}
