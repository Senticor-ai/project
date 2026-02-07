import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { InboxItem } from "./InboxItem";
import { InboxCapture } from "./InboxCapture";
import type {
  InboxItem as InboxItemType,
  Project,
  TriageResult,
} from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";
import { cn } from "@/lib/utils";

export interface InboxListProps {
  items: InboxItemType[];
  onCapture: (rawText: string) => void;
  onTriage: (item: InboxItemType, result: TriageResult) => void;
  onUpdateTitle?: (item: InboxItemType, newTitle: string) => void;
  projects?: Pick<Project, "id" | "title">[];
  className?: string;
}

export function InboxList({
  items,
  onCapture,
  onTriage,
  onUpdateTitle,
  projects,
  className,
}: InboxListProps) {
  const [expandedId, setExpandedId] = useState<CanonicalId | null>(null);

  // FIFO order: oldest first (sorted by createdAt ascending)
  const sorted = [...items].sort(
    (a, b) =>
      new Date(a.provenance.createdAt).getTime() -
      new Date(b.provenance.createdAt).getTime(),
  );

  const toggleExpand = (id: CanonicalId) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-text">
          <Icon name="inbox" size={22} />
          Inbox
        </h1>
        <p className="text-xs text-text-muted">Capture and clarify</p>
      </div>

      <InboxCapture onCapture={onCapture} />

      {sorted.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-text-muted">Inbox is empty</p>
          <p className="mt-1 text-xs text-text-subtle">
            Capture a thought to get started
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {sorted.map((item) => (
            <InboxItem
              key={item.id}
              item={item}
              isExpanded={expandedId === item.id}
              onTriage={(result) => onTriage(item, result)}
              onToggleExpand={() => toggleExpand(item.id)}
              onUpdateTitle={
                onUpdateTitle
                  ? (newTitle) => onUpdateTitle(item, newTitle)
                  : undefined
              }
              projects={projects}
            />
          ))}
        </div>
      )}

      {sorted.length > 0 && (
        <p className="text-center text-xs text-text-subtle">
          {sorted.length} item{sorted.length !== 1 && "s"} to process
        </p>
      )}
    </div>
  );
}
