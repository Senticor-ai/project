import { Icon } from "@/components/ui/Icon";
import type {
  InboxItem as InboxItemType,
  Project,
  TriageResult,
} from "@/model/gtd-types";
import { InboxTriage } from "./InboxTriage";
import { EditableTitle } from "./EditableTitle";
import { cn } from "@/lib/utils";

export interface InboxItemProps {
  item: InboxItemType;
  isExpanded: boolean;
  onTriage: (result: TriageResult) => void;
  onToggleExpand: () => void;
  onUpdateTitle?: (newTitle: string) => void;
  projects?: Pick<Project, "id" | "title">[];
  className?: string;
}

export function InboxItem({
  item,
  isExpanded,
  onTriage,
  onToggleExpand,
  onUpdateTitle,
  projects,
  className,
}: InboxItemProps) {
  const subtitle =
    item.captureSource.kind !== "thought"
      ? `via ${item.captureSource.kind}`
      : undefined;

  return (
    <div className={className}>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5",
          "transition-colors duration-[var(--duration-fast)]",
          "hover:bg-paper-100",
        )}
      >
        {/* Circle indicator — also toggles expand/collapse */}
        <button
          onClick={onToggleExpand}
          aria-label={
            isExpanded ? `Collapse ${item.title}` : `Expand ${item.title}`
          }
          className="shrink-0 text-text-subtle"
        >
          <Icon name="check_box_outline_blank" size={18} />
        </button>

        {/* Title — editable when expanded */}
        <EditableTitle
          title={item.title}
          isEditing={isExpanded}
          onSave={onUpdateTitle}
          onToggleEdit={onToggleExpand}
        />

        {/* Subtitle for non-thought sources */}
        {subtitle && (
          <span className="shrink-0 text-xs text-text-muted">{subtitle}</span>
        )}

        {/* Hover actions */}
        <button
          onClick={onToggleExpand}
          aria-label={`Edit ${item.title}`}
          className="shrink-0 text-text-subtle opacity-0 hover:text-text group-hover:opacity-100"
        >
          <Icon name="edit" size={16} />
        </button>
        <button
          aria-label={`Comment on ${item.title}`}
          className="shrink-0 text-text-subtle opacity-0 hover:text-text group-hover:opacity-100"
        >
          <Icon name="comment" size={16} />
        </button>
        <button
          aria-label={`More options for ${item.title}`}
          className="shrink-0 text-text-subtle opacity-0 hover:text-text group-hover:opacity-100"
        >
          <Icon name="more_horiz" size={16} />
        </button>
      </div>

      {/* Inline triage — visible when expanded */}
      {isExpanded && (
        <div className="mt-1 ml-8" onClick={(e) => e.stopPropagation()}>
          <InboxTriage onTriage={onTriage} projects={projects} />
        </div>
      )}
    </div>
  );
}
