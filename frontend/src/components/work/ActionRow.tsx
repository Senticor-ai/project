import { useState, useRef, useEffect } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Tooltip } from "@/components/ui/Tooltip";
import { BucketBadge } from "@/components/paperclip/BucketBadge";
import { EditableTitle } from "./EditableTitle";
import { ItemEditor } from "./ItemEditor";
import { EmailBodyViewer } from "./EmailBodyViewer";
import { getDisplayName, isUrl } from "@/model/types";
import { getMessage } from "@/lib/messages";
import type { ActionItem, Project, ItemEditableFields } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

export interface ActionRowProps {
  thing: ActionItem;
  onComplete: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMove: (id: CanonicalId, bucket: string, projectId?: CanonicalId) => void;
  onArchive: (id: CanonicalId) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onEdit?: (id: CanonicalId, fields: Partial<ItemEditableFields>) => void;
  onUpdateTitle?: (
    id: CanonicalId,
    newTitle: string,
    nameSource?: string,
  ) => void;
  /** Called when user clicks the ReadAction "Read" subtitle to navigate to the reference. */
  onNavigateToReference?: (refId: CanonicalId) => void;
  projects?: Pick<Project, "id" | "name">[];
  showBucket?: boolean;
  /** Multi-select: whether this item is selected in batch selection mode. */
  isSelected?: boolean;
  className?: string;
  /** Called when user selects a schema.org type from the "Typ ändern" menu. Pass "Action" to clear. */
  onSetType?: (id: CanonicalId, type: string) => void;
}

/** German labels for known schema.org Action subtypes. */
const SUBTYPE_LABELS: Record<string, string> = {
  BuyAction: "Kaufen",
  PlanAction: "Planen",
  CommunicateAction: "Kommunizieren",
  ReviewAction: "Prüfen",
  CreateAction: "Erstellen",
  SendAction: "Senden",
  CheckAction: "Prüfen",
  ReadAction: "Lesen",
};

/** Subtypes shown in the "Typ ändern" submenu (most common for the user's context). */
const TYPE_MENU_OPTIONS: Array<{ type: string; label: string }> = [
  { type: "BuyAction", label: "Kaufen" },
  { type: "PlanAction", label: "Planen" },
  { type: "CommunicateAction", label: "Kommunizieren" },
  { type: "ReviewAction", label: "Prüfen" },
  { type: "CreateAction", label: "Erstellen" },
  { type: "SendAction", label: "Senden" },
];

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
  isSelected,
  className,
  onSetType,
}: ActionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [showCancelOptions, setShowCancelOptions] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [prevExpanded, setPrevExpanded] = useState(isExpanded);
  // Track the latest projectId from the ItemEditor so triage buttons can use it
  const editorProjectRef = useRef<CanonicalId | undefined>(thing.projectIds[0]);

  useEffect(() => {
    if (showCalendarPicker) {
      dateInputRef.current?.focus();
    }
  }, [showCalendarPicker]);

  // Reset editing / picker state when row collapses (derived state pattern)
  if (prevExpanded !== isExpanded) {
    setPrevExpanded(isExpanded);
    if (!isExpanded) {
      setIsEditingTitle(false);
      setShowCalendarPicker(false);
      setShowCancelOptions(false);
    }
  }

  const displayName = getDisplayName(thing);
  const rawTitle = thing.name ?? thing.rawCapture ?? "";
  const titleIsUrl = isUrl(rawTitle);
  const isCompleted = !!thing.completedAt;
  const dueDateInfo = thing.dueDate ? formatDueDate(thing.dueDate) : null;
  const isInbox = thing.bucket === "inbox";
  const showSplitTitleEditor =
    !!onUpdateTitle && !!onEdit && (!isInbox || showMore);

  const { captureSource } = thing;
  const isEmail = captureSource.kind === "email";
  const isFileCapture = captureSource.kind === "file";
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
    if (isFileCapture) return "attach_file";
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
    if (!showSplitTitleEditor && !isEditingTitle && isExpanded) {
      setIsEditingTitle(true);
    }
  };

  const handleEditorChange = (fields: Partial<ItemEditableFields>) => {
    if ("projectId" in fields) {
      editorProjectRef.current = fields.projectId;
    }
    onEdit?.(thing.id, fields);
  };

  return (
    <div className={className}>
      <div
        data-copilot-item="true"
        data-copilot-item-id={thing.id}
        data-copilot-item-type="action"
        data-copilot-item-bucket={thing.bucket}
        data-copilot-item-name={displayName}
        data-copilot-item-focused={thing.isFocused ? "true" : "false"}
        className={cn(
          "group flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5",
          "transition-colors duration-[var(--duration-fast)]",
          "hover:bg-paper-100",
          isExpanded && "bg-paper-50",
          isSelected && "bg-blueprint-50 ring-1 ring-blueprint-200",
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
        <Tooltip>
          <button
            onClick={() => onComplete(thing.id)}
            aria-label={
              isCompleted
                ? `Completed: ${displayName}`
                : `Complete ${displayName}`
            }
            className={cn(
              "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center",
              isCompleted
                ? "text-text-muted"
                : "text-text-muted hover:text-text",
            )}
          >
            <Icon
              name={isCompleted ? "check_box" : "check_box_outline_blank"}
              size={18}
            />
          </button>
        </Tooltip>

        {/* Focus star */}
        <Tooltip>
          <button
            onClick={() => onToggleFocus(thing.id)}
            aria-label={
              thing.isFocused
                ? `Unfocus ${displayName}`
                : `Focus ${displayName}`
            }
            className={cn(
              "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center",
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
        </Tooltip>

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
            titleIsUrl={titleIsUrl}
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
          <Tooltip>
            <button
              onClick={() => onToggleExpand?.()}
              aria-label={`Hide notes for ${displayName}`}
              className="shrink-0 text-text-subtle hover:text-text"
            >
              <Icon name="description" size={14} />
            </button>
          </Tooltip>
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

        {/* Project badge */}
        {projects &&
          thing.projectIds[0] &&
          (() => {
            const proj = projects.find((p) => p.id === thing.projectIds[0]);
            return proj ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-app-project/10 px-1.5 py-0.5 text-[10px] font-medium text-app-project">
                <Icon name="folder" size={10} />
                {proj.name ?? "Untitled"}
              </span>
            ) : null;
          })()}

        {/* Schema type badge */}
        {thing.schemaType && SUBTYPE_LABELS[thing.schemaType] && (
          <span className="shrink-0 rounded-full bg-blueprint-50 px-1.5 py-0.5 text-[10px] font-medium text-blueprint-700">
            {SUBTYPE_LABELS[thing.schemaType]}
          </span>
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
          <Tooltip>
            <button
              onClick={() => onToggleExpand()}
              aria-label={
                isExpanded ? `Collapse ${displayName}` : `Edit ${displayName}`
              }
              className="flex shrink-0 items-center gap-1 text-text-subtle opacity-100 hover:text-text md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Icon name={isExpanded ? "expand_less" : "edit"} size={16} />
              <span className="hidden text-xs pointer-coarse:inline">
                {getMessage(
                  isExpanded ? "action.label.collapse" : "action.label.edit",
                )}
              </span>
            </button>
          </Tooltip>
        )}

        {/* Move/more menu */}
        <div className="relative">
          <Tooltip>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={`Move ${displayName}`}
              aria-expanded={menuOpen}
              className="flex shrink-0 items-center gap-1 text-text-subtle opacity-100 hover:text-text md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Icon name="more_vert" size={16} />
              <span className="hidden text-xs pointer-coarse:inline">
                {getMessage("action.label.more")}
              </span>
            </button>
          </Tooltip>

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
              {/* Move to project */}
              {onEdit && projects && projects.length > 0 && (
                <>
                  <div className="my-1 h-px bg-border" />
                  {projects
                    .filter((p) => p.id !== thing.projectIds[0])
                    .map((p) => (
                      <button
                        key={p.id}
                        role="menuitem"
                        onClick={() => {
                          onEdit(thing.id, { projectId: p.id });
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs hover:bg-paper-100"
                      >
                        <Icon
                          name="drive_file_move"
                          size={12}
                          className="text-text-subtle"
                        />
                        {p.name ?? "Untitled"}
                      </button>
                    ))}
                </>
              )}
              {/* Typ ändern */}
              {onSetType && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    Typ ändern
                  </p>
                  {TYPE_MENU_OPTIONS.map(({ type, label }) => (
                    <button
                      key={type}
                      role="menuitem"
                      onClick={() => {
                        onSetType(thing.id, type);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs hover:bg-paper-100"
                    >
                      {label}
                    </button>
                  ))}
                  {thing.schemaType && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        onSetType(thing.id, "Action");
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs text-text-muted hover:bg-paper-100"
                    >
                      Kein Typ
                    </button>
                  )}
                </>
              )}
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
          {showSplitTitleEditor && (
            <EditableTitle
              variant="split"
              name={thing.name}
              rawCapture={thing.rawCapture}
              nameProvenance={thing.nameProvenance}
              onRename={(newTitle) =>
                onUpdateTitle(
                  thing.id,
                  newTitle,
                  "user renamed in EditableTitle",
                )
              }
            />
          )}

          {/* Email body viewer */}
          {isEmail && thing.emailBody && (
            <EmailBodyViewer
              htmlBody={thing.emailBody}
              senderName={
                captureSource.kind === "email" ? captureSource.from : undefined
              }
              sourceUrl={thing.emailSourceUrl}
              onArchive={() => onArchive(thing.id)}
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
                        onMove(thing.id, bucket, editorProjectRef.current);
                      }
                    }}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-md)]",
                      "border border-border px-3 py-2 text-xs font-medium",
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
                    "inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-md)]",
                    "border border-border px-3 py-2 text-xs font-medium text-text-muted",
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
              {showCalendarPicker && !showCancelOptions && (
                <div className="mb-3 flex items-center gap-2">
                  <input
                    type="date"
                    ref={dateInputRef}
                    aria-label="Schedule date"
                    onChange={(e) => {
                      if (e.target.value) {
                        onEdit?.(thing.id, { scheduledDate: e.target.value });
                        onMove(thing.id, "calendar", editorProjectRef.current);
                        setShowCalendarPicker(false);
                        setShowCancelOptions(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setShowCalendarPicker(false);
                        setShowCancelOptions(false);
                      }
                    }}
                    className="rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setShowCancelOptions(true);
                    }}
                    aria-label="Cancel date selection"
                    className="text-xs text-text-subtle hover:text-text"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Cancel flow options: Keep in Inbox / Move to Next */}
              {showCancelOptions && (
                <div className="mb-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCalendarPicker(false);
                      setShowCancelOptions(false);
                    }}
                    className="rounded-[var(--radius-sm)] border border-border px-3 py-1.5 text-xs font-medium hover:bg-paper-100"
                  >
                    Keep in Inbox
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onMove(thing.id, "next", editorProjectRef.current);
                      setShowCalendarPicker(false);
                      setShowCancelOptions(false);
                    }}
                    className="rounded-[var(--radius-sm)] border border-border px-3 py-1.5 text-xs font-medium hover:bg-paper-100"
                  >
                    Move to Next
                  </button>
                </div>
              )}

              {/* More options toggle for inline triage */}
              {onEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowMore((prev) => !prev)}
                    aria-label={showMore ? "Less options" : "More options"}
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
