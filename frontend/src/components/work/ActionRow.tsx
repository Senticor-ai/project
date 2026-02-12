import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { BucketBadge } from "@/components/paperclip/BucketBadge";
import { EditableTitle } from "./EditableTitle";
import { ItemEditor } from "./ItemEditor";
import { EmailBodyViewer } from "./EmailBodyViewer";
import { getDisplayName } from "@/model/types";
import type { ActionItem, Project, ItemEditableFields } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

export interface ActionRowProps {
  thing: ActionItem;
  onComplete: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMove: (id: CanonicalId, bucket: string) => void;
  onArchive: (id: CanonicalId) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onEdit?: (id: CanonicalId, fields: Partial<ItemEditableFields>) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
  /** Called when user clicks the ReadAction "Read" subtitle to navigate to the reference. */
  onNavigateToReference?: (refId: CanonicalId) => void;
  projects?: Pick<Project, "id" | "name">[];
  showBucket?: boolean;
  className?: string;
}

const moveTargets: Array<{ bucket: ActionItem["bucket"]; label: string }> = [
  { bucket: "inbox", label: "Inbox" },
  { bucket: "next", label: "Next" },
  { bucket: "waiting", label: "Waiting" },
  { bucket: "calendar", label: "Calendar" },
  { bucket: "someday", label: "Later" },
];

function formatDueDate(dueDate: string): { text: string; className: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  const diffDays = Math.round(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0)
    return { text: `${dueDate} (overdue)`, className: "text-status-error" };
  if (diffDays === 0)
    return { text: "today", className: "text-status-warning" };
  if (diffDays === 1) return { text: "tomorrow", className: "text-text-muted" };
  return { text: dueDate, className: "text-text-subtle" };
}

function actionItemToEditorValues(thing: ActionItem): ItemEditableFields {
  const energyPort = thing.ports?.find(
    (p) => p.kind === "computation" && "energyLevel" in p,
  );
  return {
    contexts: (thing.contexts as string[]) ?? [],
    tags: thing.tags ?? [],
    dueDate: thing.dueDate,
    scheduledDate: thing.scheduledDate,
    projectId: thing.projectIds[0],
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
  { bucket: "next", label: "Next", icon: "bolt", colorClass: "text-app-next" },
  {
    bucket: "waiting",
    label: "Waiting",
    icon: "schedule",
    colorClass: "text-app-waiting",
  },
  {
    bucket: "calendar",
    label: "Calendar",
    icon: "calendar_month",
    colorClass: "text-app-calendar",
  },
  {
    bucket: "someday",
    label: "Later",
    icon: "cloud",
    colorClass: "text-app-someday",
  },
  {
    bucket: "reference",
    label: "Reference",
    icon: "description",
    colorClass: "text-text-muted",
  },
];

export function ActionRow({
  thing,
  onComplete,
  onToggleFocus,
  onMove,
  onArchive,
  isExpanded = false,
  onToggleExpand,
  onEdit,
  onUpdateTitle,
  onNavigateToReference,
  projects,
  showBucket = false,
  className,
}: ActionRowProps) {
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

  const { captureSource } = thing;
  const isEmail = captureSource.kind === "email";
  const isReadAction = !!thing.objectRef;
  const subtitle = (() => {
    if (isReadAction) return "Read";
    if (captureSource.kind === "email") {
      return captureSource.from ?? "via email";
    }
    if (captureSource.kind !== "thought") {
      return `via ${captureSource.kind}`;
    }
    return undefined;
  })();
  const subtitleIcon = (() => {
    if (isReadAction) return "auto_stories";
    if (isEmail) return "mail";
    return undefined;
  })();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: thing.id,
    data: { type: "thing", thing },
  });

  const handleTitleClick = () => {
    if (isEditingTitle) {
      // EditableTitle calls this on Enter/Escape/blur — exit editing
      setIsEditingTitle(false);
    } else {
      // Toggle expand/collapse
      onToggleExpand?.();
    }
  };

  const handleTitleDoubleClick = () => {
    if (!isEditingTitle && isExpanded) {
      setIsEditingTitle(true);
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
          className="hidden cursor-grab text-text-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 md:inline"
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
              ? "text-app-focus"
              : "text-text-muted hover:text-app-focus",
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
            onDoubleClick={handleTitleDoubleClick}
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

        {/* Subtitle for non-thought sources / ReadAction indicator */}
        {subtitle &&
          (isReadAction && onNavigateToReference && thing.objectRef ? (
            <button
              type="button"
              onClick={() => onNavigateToReference(thing.objectRef!)}
              aria-label="Go to reference"
              className="flex shrink-0 items-center gap-1 text-xs text-text-muted transition-colors hover:text-blueprint-500"
            >
              {subtitleIcon && <Icon name={subtitleIcon} size={12} />}
              {subtitle}
            </button>
          ) : (
            <span className="flex shrink-0 items-center gap-1 text-xs text-text-muted">
              {subtitleIcon && <Icon name={subtitleIcon} size={12} />}
              {subtitle}
            </span>
          ))}

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

        {/* Tag chips */}
        {thing.tags.length > 0 && (
          <div className="flex shrink-0 gap-0.5">
            {thing.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
              >
                {tag}
              </span>
            ))}
          </div>
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
              isExpanded ? `Collapse ${displayName}` : `Edit ${displayName}`
            }
            className="shrink-0 text-text-subtle opacity-100 hover:text-text md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
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
            className="shrink-0 text-text-subtle opacity-100 hover:text-text md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
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
          {/* Email body viewer */}
          {isEmail && thing.emailBody && (
            <EmailBodyViewer
              htmlBody={thing.emailBody}
              senderName={
                captureSource.kind === "email" ? captureSource.from : undefined
              }
              sourceUrl={thing.emailSourceUrl}
              className="mb-3"
            />
          )}

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
                      values={actionItemToEditorValues(thing)}
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
              values={actionItemToEditorValues(thing)}
              onChange={handleEditorChange}
              projects={projects}
            />
          )}
        </div>
      )}
    </div>
  );
}
