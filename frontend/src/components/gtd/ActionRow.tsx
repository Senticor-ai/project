import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { BucketBadge } from "@/components/paperclip/BucketBadge";
import { EditableTitle } from "./EditableTitle";
import { ItemEditor } from "./ItemEditor";
import type { Action, Project, ItemEditableFields } from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";

export interface ActionRowProps {
  action: Action;
  onComplete: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMove: (id: CanonicalId, bucket: Action["bucket"]) => void;
  onSelect: (id: CanonicalId) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onEdit?: (id: CanonicalId, fields: Partial<ItemEditableFields>) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
  projects?: Pick<Project, "id" | "title">[];
  showBucket?: boolean;
  className?: string;
}

const moveTargets: Array<{ bucket: Action["bucket"]; label: string }> = [
  { bucket: "next", label: "Next" },
  { bucket: "waiting", label: "Waiting" },
  { bucket: "calendar", label: "Calendar" },
  { bucket: "someday", label: "Someday" },
];

function formatDueDate(dueDate: string): { text: string; className: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  const diffDays = Math.round(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0)
    return { text: `${dueDate} (overdue)`, className: "text-red-600" };
  if (diffDays === 0) return { text: "today", className: "text-orange-600" };
  if (diffDays === 1) return { text: "tomorrow", className: "text-text-muted" };
  return { text: dueDate, className: "text-text-subtle" };
}

function actionToEditorValues(action: Action): ItemEditableFields {
  const energyPort = action.ports?.find(
    (p) => p.kind === "computation" && "energyLevel" in p,
  );
  return {
    contexts: (action.contexts as string[]) ?? [],
    dueDate: action.dueDate,
    scheduledDate: action.scheduledDate,
    projectId: action.projectId,
    notes: action.notes,
    energyLevel: energyPort
      ? (energyPort as { energyLevel: "low" | "medium" | "high" }).energyLevel
      : undefined,
  };
}

export function ActionRow({
  action,
  onComplete,
  onToggleFocus,
  onMove,
  onSelect,
  isExpanded = false,
  onToggleExpand,
  onEdit,
  onUpdateTitle,
  projects,
  showBucket = false,
  className,
}: ActionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isCompleted = !!action.completedAt;
  const dueDateInfo = action.dueDate ? formatDueDate(action.dueDate) : null;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: action.id,
    data: { type: "action", action },
  });

  const handleTitleClick = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      onSelect(action.id);
    }
  };

  const handleEditorChange = (fields: Partial<ItemEditableFields>) => {
    onEdit?.(action.id, fields);
  };

  return (
    <div className={className}>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5",
          "transition-colors duration-[var(--duration-fast)]",
          "hover:bg-paper-100",
          isDragging && "opacity-50",
        )}
      >
        {/* Drag handle */}
        <span
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          aria-label={`Drag ${action.title}`}
          className="cursor-grab text-text-subtle opacity-0 group-hover:opacity-100"
        >
          <Icon name="drag_indicator" size={14} />
        </span>

        {/* Complete checkbox */}
        <button
          onClick={() => onComplete(action.id)}
          aria-label={
            isCompleted
              ? `Completed: ${action.title}`
              : `Complete ${action.title}`
          }
          className={cn(
            "shrink-0",
            isCompleted
              ? "text-text-muted"
              : "text-text-subtle hover:text-text",
          )}
        >
          <Icon
            name={isCompleted ? "check_box" : "check_box_outline_blank"}
            size={18}
          />
        </button>

        {/* Focus star */}
        <button
          onClick={() => onToggleFocus(action.id)}
          aria-label={
            action.isFocused
              ? `Unfocus ${action.title}`
              : `Focus ${action.title}`
          }
          className={cn(
            "shrink-0",
            action.isFocused
              ? "text-gtd-focus"
              : "text-text-subtle hover:text-gtd-focus",
          )}
        >
          <Icon
            name={action.isFocused ? "star" : "star_outline"}
            size={18}
            fill={action.isFocused}
          />
        </button>

        {/* Title — editable when expanded */}
        <EditableTitle
          title={action.title}
          isEditing={isExpanded}
          onSave={
            onUpdateTitle
              ? (newTitle) => onUpdateTitle(action.id, newTitle)
              : undefined
          }
          onToggleEdit={handleTitleClick}
          completed={isCompleted}
        />

        {/* Note indicator */}
        {action.notes && (
          <Icon
            name="description"
            size={14}
            className="shrink-0 text-text-subtle"
          />
        )}

        {/* Due date */}
        {dueDateInfo && (
          <span className={cn("shrink-0 text-xs", dueDateInfo.className)}>
            {dueDateInfo.text}
          </span>
        )}

        {/* Bucket badge (for Focus/mixed views) */}
        {showBucket && (
          <BucketBadge bucket={action.bucket} className="shrink-0" />
        )}

        {/* Move menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={`Move ${action.title}`}
            aria-expanded={menuOpen}
            className="shrink-0 text-text-subtle opacity-0 hover:text-text group-hover:opacity-100"
          >
            <Icon name="more_vert" size={16} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded-[var(--radius-md)] border border-border bg-surface-raised p-1 shadow-[var(--shadow-sheet)]"
              role="menu"
            >
              {moveTargets
                .filter((t) => t.bucket !== action.bucket)
                .map(({ bucket, label }) => (
                  <button
                    key={bucket}
                    role="menuitem"
                    onClick={() => {
                      onMove(action.id, bucket);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs hover:bg-paper-100"
                  >
                    <BucketBadge bucket={bucket} />
                    Move to {label}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Inline editor */}
      {isExpanded && onEdit && (
        <div className="mt-1 ml-8">
          <ItemEditor
            values={actionToEditorValues(action)}
            onChange={handleEditorChange}
            projects={projects}
          />
        </div>
      )}
    </div>
  );
}
