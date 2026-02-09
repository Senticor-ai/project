import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { BucketBadge } from "@/components/paperclip/BucketBadge";
import { EditableTitle } from "./EditableTitle";
import { ItemEditor } from "./ItemEditor";
import { getDisplayName } from "@/model/types";
import type { Thing, Project, ItemEditableFields } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

export interface ThingRowProps {
  thing: Thing;
  onComplete: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMove: (id: CanonicalId, bucket: string) => void;
  onArchive: (id: CanonicalId) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onEdit?: (id: CanonicalId, fields: Partial<ItemEditableFields>) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
  projects?: Pick<Project, "id" | "name">[];
  showBucket?: boolean;
  className?: string;
}

const moveTargets: Array<{ bucket: Thing["bucket"]; label: string }> = [
  { bucket: "inbox", label: "Inbox" },
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

function thingToEditorValues(thing: Thing): ItemEditableFields {
  const energyPort = thing.ports?.find(
    (p) => p.kind === "computation" && "energyLevel" in p,
  );
  return {
    contexts: (thing.contexts as string[]) ?? [],
    dueDate: thing.dueDate,
    scheduledDate: thing.scheduledDate,
    projectId: thing.projectId,
    description: thing.description,
    energyLevel: energyPort
      ? (energyPort as { energyLevel: "low" | "medium" | "high" }).energyLevel
      : undefined,
  };
}

const triageTargets: Array<{
  bucket: string;
  label: string;
  icon: string;
  colorClass: string;
}> = [
  { bucket: "next", label: "Next", icon: "bolt", colorClass: "text-gtd-next" },
  {
    bucket: "waiting",
    label: "Waiting",
    icon: "schedule",
    colorClass: "text-gtd-waiting",
  },
  {
    bucket: "calendar",
    label: "Calendar",
    icon: "calendar_month",
    colorClass: "text-gtd-calendar",
  },
  {
    bucket: "someday",
    label: "Someday",
    icon: "cloud",
    colorClass: "text-gtd-someday",
  },
  {
    bucket: "reference",
    label: "Reference",
    icon: "description",
    colorClass: "text-text-muted",
  },
];

export function ThingRow({
  thing,
  onComplete,
  onToggleFocus,
  onMove,
  onArchive,
  isExpanded = false,
  onToggleExpand,
  onEdit,
  onUpdateTitle,
  projects,
  showBucket = false,
  className,
}: ThingRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [prevExpanded, setPrevExpanded] = useState(isExpanded);

  // Reset editing / picker state when row collapses (derived state pattern)
  if (prevExpanded !== isExpanded) {
    setPrevExpanded(isExpanded);
    if (!isExpanded) {
      setIsEditingTitle(false);
      setShowCalendarPicker(false);
    }
  }

  const displayName = getDisplayName(thing);
  const isCompleted = !!thing.completedAt;
  const dueDateInfo = thing.dueDate ? formatDueDate(thing.dueDate) : null;
  const isInbox = thing.bucket === "inbox";

  const subtitle =
    thing.captureSource.kind !== "thought"
      ? `via ${thing.captureSource.kind}`
      : undefined;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: thing.id,
    data: { type: "thing", thing },
  });

  const handleTitleClick = () => {
    if (isEditingTitle) {
      // EditableTitle calls this on Enter/Escape/blur — exit editing
      setIsEditingTitle(false);
    } else if (isExpanded) {
      // Expanded but not editing — enter title editing
      setIsEditingTitle(true);
    } else {
      // Collapsed — expand
      onToggleExpand?.();
    }
  };

  const handleEditorChange = (fields: Partial<ItemEditableFields>) => {
    onEdit?.(thing.id, fields);
  };

  return (
    <div className={className}>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5",
          "transition-colors duration-[var(--duration-fast)]",
          "hover:bg-paper-100",
          isExpanded && "bg-paper-50",
          isDragging && "opacity-50",
        )}
      >
        {/* Drag handle */}
        <span
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          aria-label={`Drag ${displayName}`}
          className="cursor-grab text-text-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Icon name="drag_indicator" size={14} />
        </span>

        {/* Complete checkbox */}
        <button
          onClick={() => onComplete(thing.id)}
          aria-label={
            isCompleted
              ? `Completed: ${displayName}`
              : `Complete ${displayName}`
          }
          className={cn(
            "shrink-0",
            isCompleted ? "text-text-muted" : "text-text-muted hover:text-text",
          )}
        >
          <Icon
            name={isCompleted ? "check_box" : "check_box_outline_blank"}
            size={18}
          />
        </button>

        {/* Focus star */}
        <button
          onClick={() => onToggleFocus(thing.id)}
          aria-label={
            thing.isFocused ? `Unfocus ${displayName}` : `Focus ${displayName}`
          }
          className={cn(
            "shrink-0",
            thing.isFocused
              ? "text-gtd-focus"
              : "text-text-muted hover:text-gtd-focus",
          )}
        >
          <Icon
            name={thing.isFocused ? "star" : "star_outline"}
            size={18}
            fill={thing.isFocused}
          />
        </button>

        {/* Title + notes preview column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <EditableTitle
            title={displayName}
            isEditing={isEditingTitle}
            onSave={
              onUpdateTitle
                ? (newTitle) => onUpdateTitle(thing.id, newTitle)
                : undefined
            }
            onToggleEdit={handleTitleClick}
            completed={isCompleted}
            ariaExpanded={onToggleExpand ? isExpanded : undefined}
          />
          {!isExpanded && thing.description && (
            <button
              type="button"
              onClick={() => onToggleExpand?.()}
              aria-label={`Notes for ${displayName}`}
              className="mt-0.5 whitespace-pre-wrap text-left text-xs text-text-muted line-clamp-[10]"
            >
              {thing.description}
            </button>
          )}
        </div>

        {/* Subtitle for non-thought sources */}
        {subtitle && (
          <span className="shrink-0 text-xs text-text-muted">{subtitle}</span>
        )}

        {/* Note indicator — only when expanded (collapsed shows text preview instead) */}
        {isExpanded && thing.description && (
          <button
            onClick={() => onToggleExpand?.()}
            aria-label={`Hide notes for ${displayName}`}
            className="shrink-0 text-text-subtle hover:text-text"
          >
            <Icon name="description" size={14} />
          </button>
        )}

        {/* Due date */}
        {dueDateInfo && (
          <span className={cn("shrink-0 text-xs", dueDateInfo.className)}>
            {dueDateInfo.text}
          </span>
        )}

        {/* Bucket badge */}
        {showBucket && (
          <BucketBadge bucket={thing.bucket} className="shrink-0" />
        )}

        {/* Edit/Collapse button (hover) */}
        {onToggleExpand && (
          <button
            onClick={() => onToggleExpand()}
            aria-label={
              isExpanded
                ? `Collapse ${displayName}`
                : `Edit ${displayName}`
            }
            className="shrink-0 text-text-subtle opacity-0 hover:text-text group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Icon name={isExpanded ? "expand_less" : "edit"} size={16} />
          </button>
        )}

        {/* Move/more menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={`Move ${displayName}`}
            aria-expanded={menuOpen}
            className="shrink-0 text-text-subtle opacity-0 hover:text-text group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Icon name="more_vert" size={16} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded-[var(--radius-md)] border border-border bg-surface-raised p-1 shadow-[var(--shadow-sheet)]"
              role="menu"
            >
              {moveTargets
                .filter((t) => t.bucket !== thing.bucket)
                .map(({ bucket, label }) => (
                  <button
                    key={bucket}
                    role="menuitem"
                    onClick={() => {
                      onMove(thing.id, bucket);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs hover:bg-paper-100"
                  >
                    <BucketBadge bucket={bucket} />
                    Move to {label}
                  </button>
                ))}
              <div className="my-1 h-px bg-border" />
              <button
                role="menuitem"
                onClick={() => {
                  onArchive(thing.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs text-text-muted hover:bg-paper-100"
              >
                <Icon name="archive" size={12} />
                Archive
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-1 ml-8">
          {/* Triage quick-buttons for inbox items */}
          {isInbox && (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {triageTargets.map(({ bucket, label, icon, colorClass }) => (
                  <button
                    key={bucket}
                    onClick={() => {
                      if (bucket === "calendar") {
                        setShowCalendarPicker(true);
                      } else {
                        onMove(thing.id, bucket);
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[var(--radius-md)]",
                      "border border-border px-2 py-1 text-xs font-medium",
                      "transition-colors duration-[var(--duration-fast)]",
                      "hover:bg-paper-100",
                    )}
                    aria-label={`Move to ${label}`}
                  >
                    <Icon name={icon} size={12} className={colorClass} />
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => onArchive(thing.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-[var(--radius-md)]",
                    "border border-border px-2 py-1 text-xs font-medium text-text-muted",
                    "transition-colors duration-[var(--duration-fast)]",
                    "hover:bg-paper-100",
                  )}
                  aria-label="Archive"
                >
                  <Icon name="archive" size={12} />
                  Archive
                </button>
              </div>

              {/* Inline date picker for Calendar triage */}
              {showCalendarPicker && (
                <div className="mb-3 flex items-center gap-2">
                  <input
                    type="date"
                    autoFocus
                    aria-label="Schedule date"
                    onChange={(e) => {
                      if (e.target.value) {
                        onEdit?.(thing.id, { scheduledDate: e.target.value });
                        onMove(thing.id, "calendar");
                        setShowCalendarPicker(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setShowCalendarPicker(false);
                    }}
                    className="rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCalendarPicker(false)}
                    aria-label="Cancel date selection"
                    className="text-xs text-text-subtle hover:text-text"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* More options toggle for inline triage */}
              {onEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowMore((prev) => !prev)}
                    className="mb-2 flex items-center gap-1 text-xs text-text-subtle hover:text-text"
                  >
                    <Icon
                      name={showMore ? "expand_less" : "expand_more"}
                      size={14}
                    />
                    {showMore ? "Less options" : "More options"}
                  </button>
                  {showMore && (
                    <ItemEditor
                      values={thingToEditorValues(thing)}
                      onChange={handleEditorChange}
                      projects={projects}
                    />
                  )}
                </>
              )}
            </>
          )}

          {/* Item editor for non-inbox items */}
          {!isInbox && onEdit && (
            <ItemEditor
              values={thingToEditorValues(thing)}
              onChange={handleEditorChange}
              projects={projects}
            />
          )}
        </div>
      )}
    </div>
  );
}
