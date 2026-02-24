import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { ItemList } from "./ItemList";
import { ActionRow } from "./ActionRow";
import { ContextFilterBar } from "./ContextFilterBar";
import { EnergyFilterBar } from "./EnergyFilterBar";
import { TimeFilterDropdown } from "./TimeFilterDropdown";
import { FileDropZone } from "./FileDropZone";
import { useAllCompletedItems } from "@/hooks/use-items";
import { useActionFilters } from "@/hooks/use-action-filters";
import type {
  ActionItem,
  Project,
  ItemEditableFields,
  ComputationPort,
  TimeEstimate,
} from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

// ---------------------------------------------------------------------------
// Bucket metadata
// ---------------------------------------------------------------------------

const bucketMeta: Record<
  ActionItem["bucket"] | "focus",
  { label: string; icon: string; subtitle: string }
> = {
  inbox: {
    label: "Inbox",
    icon: "inbox",
    subtitle: "Capture and clarify",
  },
  next: {
    label: "Next",
    icon: "bolt",
    subtitle: "To-do's for anytime",
  },
  waiting: {
    label: "Waiting",
    icon: "schedule",
    subtitle: "Delegated or blocked",
  },
  calendar: {
    label: "Calendar",
    icon: "calendar_month",
    subtitle: "Scheduled actions",
  },
  someday: {
    label: "Later",
    icon: "cloud",
    subtitle: "When the time is right",
  },
  focus: {
    label: "Focus",
    icon: "center_focus_strong",
    subtitle: "Starred actions",
  },
};

// ---------------------------------------------------------------------------
// Time estimate ordering (for <= comparison)
// ---------------------------------------------------------------------------

const TIME_ESTIMATE_ORDER: Record<TimeEstimate, number> = {
  "5min": 1,
  "15min": 2,
  "30min": 3,
  "1hr": 4,
  "2hr": 5,
  "half-day": 6,
  "full-day": 7,
};

function getComputationPort(item: ActionItem): ComputationPort | undefined {
  return item.ports.find((p) => p.kind === "computation") as
    | ComputationPort
    | undefined;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ActionListProps {
  bucket: ActionItem["bucket"] | "focus";
  items: ActionItem[];
  onAdd: (title: string) => Promise<void> | void;
  onComplete: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMove: (id: CanonicalId, bucket: string, projectId?: CanonicalId) => void;
  onArchive: (id: CanonicalId) => void;
  onEdit?: (id: CanonicalId, fields: Partial<ItemEditableFields>) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
  /** Called when files are dropped onto the inbox. Only active when bucket is "inbox". */
  onFileDrop?: (files: File[]) => void;
  /** Called when user clicks the ReadAction "Read" subtitle to navigate to its reference. */
  onNavigateToReference?: (refId: CanonicalId) => void;
  projects?: Pick<Project, "id" | "name">[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActionList({
  bucket,
  items,
  onAdd,
  onComplete,
  onToggleFocus,
  onMove,
  onArchive,
  onEdit,
  onUpdateTitle,
  onFileDrop,
  onNavigateToReference,
  projects,
  className,
}: ActionListProps) {
  const [expandedId, setExpandedId] = useState<CanonicalId | null>(null);
  const {
    selectedContexts,
    selectedEnergy,
    maxTimeEstimate,
    toggleContext,
    clearAll,
    setEnergy,
    setMaxTime,
    hasActiveFilters,
  } = useActionFilters(bucket);
  const [selectedIds, setSelectedIds] = useState<Set<CanonicalId>>(new Set());
  const lastSelectedIndexRef = useRef<number | null>(null);
  const [prevBucket, setPrevBucket] = useState(bucket);
  const meta = bucketMeta[bucket];
  const isInbox = bucket === "inbox";
  const isFocusView = bucket === "focus";

  // Collapse all on bucket change (render-time state adjustment)
  if (prevBucket !== bucket) {
    setPrevBucket(bucket);
    setExpandedId(null);
    setSelectedIds(new Set());
  }

  // Reset selection anchor when bucket changes (refs cannot be written during render)
  useEffect(() => {
    lastSelectedIndexRef.current = null;
  }, [bucket]);

  // Detect file drags at document level — show drop zone only when active.
  // Uses capture phase so events are seen before FileDropZone's stopPropagation.
  // Debounces the "hide" transition to avoid flicker from DOM-layout-shift events.
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const fileDragCounter = useRef(0);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isInbox || !onFileDrop) return;

    const handleEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      fileDragCounter.current++;
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setIsFileDragActive(true);
    };
    const handleLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      fileDragCounter.current = Math.max(0, fileDragCounter.current - 1);
      if (fileDragCounter.current === 0) {
        hideTimeoutRef.current = setTimeout(() => {
          setIsFileDragActive(false);
          hideTimeoutRef.current = null;
        }, 50);
      }
    };
    // Prevent browser from opening dropped files (e.g. PDF in new tab)
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const handleDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
      fileDragCounter.current = 0;
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setIsFileDragActive(false);
    };

    // Capture phase: fires before child stopPropagation can block bubbling
    document.addEventListener("dragenter", handleEnter, true);
    document.addEventListener("dragleave", handleLeave, true);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);
    return () => {
      document.removeEventListener("dragenter", handleEnter, true);
      document.removeEventListener("dragleave", handleLeave, true);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      fileDragCounter.current = 0;
    };
  }, [isInbox, onFileDrop]);

  // Always fetch completed items (shown in collapsible Done section)
  const completedQuery = useAllCompletedItems(true);

  const handleToggleFocus = useCallback(
    (id: CanonicalId) => onToggleFocus(id),
    [onToggleFocus],
  );

  // Filter active items
  const filtered = useMemo(() => {
    if (isFocusView) {
      return items.filter((t) => t.isFocused);
    }
    return items.filter((t) => t.bucket === bucket);
  }, [items, bucket, isFocusView]);

  // Completed items from the lazy-loaded query
  const completedItems = useMemo(() => {
    if (!completedQuery.data) return [];
    const items = isFocusView
      ? completedQuery.data.filter((t) => t.isFocused)
      : completedQuery.data.filter((t) => t.bucket === bucket);
    return items.sort(
      (a, b) =>
        new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime(),
    );
  }, [completedQuery.data, bucket, isFocusView]);

  // Context counts
  const contextCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const thing of filtered) {
      for (const ctx of thing.contexts as unknown as string[]) {
        counts[ctx] = (counts[ctx] ?? 0) + 1;
      }
    }
    return counts;
  }, [filtered]);

  const availableContexts = useMemo(
    () => Object.keys(contextCounts).sort(),
    [contextCounts],
  );

  // Apply context filter
  const contextFiltered =
    selectedContexts.length > 0
      ? filtered.filter((t) =>
          (t.contexts as unknown as string[]).some((c) =>
            selectedContexts.includes(c),
          ),
        )
      : filtered;

  // Apply energy filter
  const energyFiltered =
    selectedEnergy !== null
      ? contextFiltered.filter((t) => {
          const cp = getComputationPort(t);
          return cp?.energyLevel === selectedEnergy;
        })
      : contextFiltered;

  // Apply time filter
  const timeFiltered =
    maxTimeEstimate !== null
      ? energyFiltered.filter((t) => {
          const cp = getComputationPort(t);
          if (!cp?.timeEstimate) return false;
          return (
            TIME_ESTIMATE_ORDER[cp.timeEstimate] <=
            TIME_ESTIMATE_ORDER[maxTimeEstimate]
          );
        })
      : energyFiltered;

  // Compute energy counts from filtered items (after context + time filters)
  // Energy counts — computed for potential future badge display
  void useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of timeFiltered) {
      const cp = getComputationPort(item);
      if (cp?.energyLevel) {
        counts[cp.energyLevel] = (counts[cp.energyLevel] ?? 0) + 1;
      }
    }
    return counts;
  }, [timeFiltered]);

  // Sort
  const sorted = useMemo(() => {
    if (isInbox) {
      return [...timeFiltered].sort(
        (a, b) =>
          new Date(b.provenance.createdAt).getTime() -
          new Date(a.provenance.createdAt).getTime(),
      );
    }
    return [...timeFiltered].sort((a, b) => {
      if (a.isFocused !== b.isFocused) return a.isFocused ? -1 : 1;
      if (a.sequenceOrder != null && b.sequenceOrder != null)
        return a.sequenceOrder - b.sequenceOrder;
      return (
        new Date(b.provenance.createdAt).getTime() -
        new Date(a.provenance.createdAt).getTime()
      );
    });
  }, [timeFiltered, isInbox]);

  // Derive the effective expanded ID: for inbox, auto-expand the first item
  // when nothing is expanded, or advance to the newest remaining item after
  // the currently expanded item is triaged away.  Pure derivation avoids the
  // stale-data issue that render-time setState had with optimistic updates.
  const effectiveExpandedId = useMemo(() => {
    if (bucket !== "inbox" || sorted.length === 0) return expandedId;
    if (expandedId === null) return sorted[0]?.id ?? null;
    if (!sorted.some((t) => t.id === expandedId)) return sorted[0]?.id ?? null;
    return expandedId;
  }, [bucket, sorted, expandedId]);

  // Explorer-style selection: click = exclusive, Ctrl/Cmd = toggle, Shift = range
  const handleItemClick = useCallback(
    (index: number, id: CanonicalId, event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      // Let explicit interactive controls handle their own clicks.
      // Do not match generic ancestor [aria-label] nodes (e.g., page/main wrappers),
      // otherwise inbox selection is accidentally disabled.
      if (
        target.closest(
          'button[aria-label], a[aria-label], input, textarea, select, [role="menu"], [role="menuitem"]',
        )
      )
        return;

      // Prevent click from reaching inner buttons (expand/collapse via title)
      event.stopPropagation();
      event.preventDefault();

      if (event.shiftKey && lastSelectedIndexRef.current !== null) {
        // Range select: replace selection with range from anchor to clicked
        const start = Math.min(lastSelectedIndexRef.current, index);
        const end = Math.max(lastSelectedIndexRef.current, index);
        const rangeIds = sorted.slice(start, end + 1).map((t) => t.id);
        setSelectedIds(new Set(rangeIds));
      } else if (event.metaKey || event.ctrlKey) {
        // Toggle additive
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        lastSelectedIndexRef.current = index;
      } else {
        // Exclusive select
        setSelectedIds(new Set([id]));
        lastSelectedIndexRef.current = index;
      }
    },
    [sorted],
  );

  const handleBatchTriage = useCallback(
    (targetBucket: string) => {
      for (const id of selectedIds) {
        if (targetBucket === "archive") {
          onArchive(id);
        } else {
          onMove(id, targetBucket);
        }
      }
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;
    },
    [selectedIds, onMove, onArchive],
  );

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(sorted.map((t) => t.id)));
  }, [sorted]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedIndexRef.current = null;
  }, []);

  // Clean stale selection IDs (items that were triaged away)
  const currentIds = useMemo(() => new Set(sorted.map((t) => t.id)), [sorted]);
  const hasStale = useMemo(
    () => [...selectedIds].some((id) => !currentIds.has(id)),
    [selectedIds, currentIds],
  );
  if (hasStale) {
    setSelectedIds(
      (prev) => new Set([...prev].filter((id) => currentIds.has(id))),
    );
  }

  return (
    <ItemList<ActionItem>
      items={sorted}
      header={meta}
      rapidEntry={
        !isFocusView
          ? {
              placeholder: isInbox
                ? "Capture a thought..."
                : "Rapid Entry — type here and hit enter / or esc",
              ariaLabel: isInbox ? "Capture a thought" : "Rapid entry",
              onAdd,
              showCaptureErrors: true,
            }
          : undefined
      }
      renderItem={(thing, { isExpanded, onToggleExpand }) => (
        <div
          onClickCapture={
            isInbox
              ? (e) => {
                  const idx = sorted.indexOf(thing);
                  handleItemClick(idx, thing.id, e);
                }
              : undefined
          }
        >
          <ActionRow
            thing={thing}
            onComplete={onComplete}
            onToggleFocus={handleToggleFocus}
            onMove={onMove}
            onArchive={onArchive}
            isExpanded={isExpanded}
            onToggleExpand={
              onEdit || onUpdateTitle ? onToggleExpand : undefined
            }
            onEdit={onEdit}
            onUpdateTitle={onUpdateTitle}
            onNavigateToReference={onNavigateToReference}
            projects={projects}
            showBucket={isFocusView}
            isSelected={isInbox ? selectedIds.has(thing.id) : undefined}
          />
        </div>
      )}
      emptyMessage={
        hasActiveFilters && filtered.length > 0
          ? "No actions match your filters"
          : isInbox
            ? "Inbox is empty"
            : isFocusView
              ? "No focused actions"
              : "No actions here yet"
      }
      emptyHint={
        hasActiveFilters && filtered.length > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Clear filters
          </button>
        ) : isInbox ? (
          "Capture a thought to get started"
        ) : undefined
      }
      footer={{
        formatCount: (count) =>
          isInbox
            ? `${count} item${count !== 1 ? "s" : ""} to process`
            : `${count} action${count !== 1 ? "s" : ""}`,
      }}
      secondarySection={
        completedItems.length > 0
          ? {
              label: "Done",
              items: completedItems,
              isLoading: completedQuery.isFetching,
              renderItem: (thing) => (
                <ActionRow
                  key={thing.id}
                  thing={thing}
                  onComplete={onComplete}
                  onToggleFocus={handleToggleFocus}
                  onMove={onMove}
                  onArchive={onArchive}
                  showBucket={isFocusView}
                />
              ),
            }
          : undefined
      }
      beforeItems={
        <>
          {/* Batch action bar — visible when inbox items are selected */}
          {isInbox && selectedIds.size > 0 && (
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-[var(--radius-md)]",
                "border border-blueprint-200 bg-blueprint-50/50 px-3 py-2",
              )}
              role="toolbar"
              aria-label="Batch actions"
            >
              <span className="text-xs font-medium text-blueprint-700">
                {selectedIds.size} selected
              </span>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    {
                      bucket: "next",
                      label: "Next",
                      icon: "bolt",
                      colorClass: "text-app-next",
                    },
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
                  ] as const
                ).map(({ bucket: b, label, icon, colorClass }) => (
                  <button
                    key={b}
                    onClick={() => handleBatchTriage(b)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[var(--radius-md)]",
                      "border border-border bg-surface px-2 py-1 text-xs font-medium",
                      "transition-colors duration-[var(--duration-fast)]",
                      "hover:bg-paper-100",
                    )}
                    aria-label={`Batch move to ${label}`}
                  >
                    <Icon name={icon} size={12} className={colorClass} />
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => handleBatchTriage("archive")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-[var(--radius-md)]",
                    "border border-border bg-surface px-2 py-1 text-xs font-medium text-text-muted",
                    "transition-colors duration-[var(--duration-fast)]",
                    "hover:bg-paper-100",
                  )}
                  aria-label="Batch archive"
                >
                  <Icon name="archive" size={12} />
                  Archive
                </button>
              </div>
              {/* Project picker — auto-moves selected items to "next" + project */}
              {projects && projects.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const pid = e.target.value
                      ? (e.target.value as CanonicalId)
                      : undefined;
                    if (pid) {
                      for (const id of selectedIds) {
                        onMove(id, "next", pid);
                      }
                      setSelectedIds(new Set());
                      lastSelectedIndexRef.current = null;
                    }
                  }}
                  aria-label="Move batch to project"
                  className="rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
                >
                  <option value="">Move to project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="ml-auto flex gap-1">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-blueprint-600 hover:text-blueprint-800"
                  aria-label="Select all"
                >
                  Select all
                </button>
                <span className="text-text-subtle">|</span>
                <button
                  onClick={handleClearSelection}
                  className="text-xs text-text-muted hover:text-text"
                  aria-label="Clear selection"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
          {isInbox && onFileDrop && isFileDragActive && (
            <FileDropZone
              onFilesDropped={(files) => {
                onFileDrop(files);
                // Reset drag state — the document drop handler won't fire
                // because FileDropZone calls stopPropagation().
                fileDragCounter.current = 0;
                if (hideTimeoutRef.current) {
                  clearTimeout(hideTimeoutRef.current);
                  hideTimeoutRef.current = null;
                }
                setIsFileDragActive(false);
              }}
              className="py-1"
              maxSizeMb={25}
            />
          )}
          {(availableContexts.length > 0 || hasActiveFilters) && (
            <div className="flex flex-col gap-1.5">
              {availableContexts.length > 0 && (
                <ContextFilterBar
                  contexts={availableContexts}
                  selectedContexts={selectedContexts}
                  actionCounts={contextCounts}
                  onToggleContext={toggleContext}
                  onClearAll={clearAll}
                />
              )}
              <div className="flex items-center gap-3">
                <EnergyFilterBar
                  selectedEnergy={selectedEnergy}
                  onToggleEnergy={(level) =>
                    setEnergy(selectedEnergy === level ? null : level)
                  }
                />
                <TimeFilterDropdown
                  maxTimeEstimate={maxTimeEstimate}
                  onChangeMaxTime={setMaxTime}
                />
              </div>
            </div>
          )}
        </>
      }
      expandedId={effectiveExpandedId}
      onExpandedIdChange={setExpandedId}
      className={className}
    />
  );
}
