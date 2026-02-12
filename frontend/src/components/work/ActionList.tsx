import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ItemList } from "./ItemList";
import { ActionRow } from "./ActionRow";
import { ContextFilterBar } from "./ContextFilterBar";
import { FileDropZone } from "./FileDropZone";
import { useAllCompletedItems } from "@/hooks/use-items";
import type { ActionItem, Project, ItemEditableFields } from "@/model/types";
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
// Props
// ---------------------------------------------------------------------------

export interface ActionListProps {
  bucket: ActionItem["bucket"] | "focus";
  items: ActionItem[];
  onAdd: (title: string) => Promise<void> | void;
  onComplete: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMove: (id: CanonicalId, bucket: string) => void;
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
  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
  const [prevBucket, setPrevBucket] = useState(bucket);
  const meta = bucketMeta[bucket];
  const isInbox = bucket === "inbox";
  const isFocusView = bucket === "focus";

  // Collapse all on bucket change (render-time state adjustment)
  if (prevBucket !== bucket) {
    setPrevBucket(bucket);
    setExpandedId(null);
  }

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

  // Sort
  const sorted = useMemo(() => {
    if (isInbox) {
      return [...contextFiltered].sort(
        (a, b) =>
          new Date(b.provenance.createdAt).getTime() -
          new Date(a.provenance.createdAt).getTime(),
      );
    }
    return [...contextFiltered].sort((a, b) => {
      if (a.isFocused !== b.isFocused) return a.isFocused ? -1 : 1;
      if (a.sequenceOrder != null && b.sequenceOrder != null)
        return a.sequenceOrder - b.sequenceOrder;
      return (
        new Date(b.provenance.createdAt).getTime() -
        new Date(a.provenance.createdAt).getTime()
      );
    });
  }, [contextFiltered, isInbox]);

  // Auto-expand the first inbox item when nothing is expanded yet
  if (bucket === "inbox" && sorted.length > 0 && expandedId === null) {
    setExpandedId(sorted[0]?.id ?? null);
  }

  // Auto-advance to next inbox item when current is triaged away
  if (bucket === "inbox" && sorted.length > 0 && expandedId !== null) {
    if (!sorted.some((t) => t.id === expandedId)) {
      setExpandedId(sorted[0]?.id ?? null);
    }
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
        <ActionRow
          key={thing.id}
          thing={thing}
          onComplete={onComplete}
          onToggleFocus={handleToggleFocus}
          onMove={onMove}
          onArchive={onArchive}
          isExpanded={isExpanded}
          onToggleExpand={onEdit || onUpdateTitle ? onToggleExpand : undefined}
          onEdit={onEdit}
          onUpdateTitle={onUpdateTitle}
          onNavigateToReference={onNavigateToReference}
          projects={projects}
          showBucket={isFocusView}
        />
      )}
      emptyMessage={
        isInbox
          ? "Inbox is empty"
          : isFocusView
            ? "No focused actions"
            : "No actions here yet"
      }
      emptyHint={isInbox ? "Capture a thought to get started" : undefined}
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
          {availableContexts.length > 0 && (
            <ContextFilterBar
              contexts={availableContexts}
              selectedContexts={selectedContexts}
              actionCounts={contextCounts}
              onToggleContext={(ctx) =>
                setSelectedContexts((prev) =>
                  prev.includes(ctx)
                    ? prev.filter((c) => c !== ctx)
                    : [...prev, ctx],
                )
              }
              onClearAll={() => setSelectedContexts([])}
            />
          )}
        </>
      }
      expandedId={expandedId}
      onExpandedIdChange={setExpandedId}
      className={className}
    />
  );
}
