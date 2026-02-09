import { useState, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { ThingRow } from "./ThingRow";
import { ContextFilterBar } from "./ContextFilterBar";
import { useAllCompletedThings } from "@/hooks/use-things";
import type { Thing, Project, ItemEditableFields } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

const bucketMeta: Record<
  Thing["bucket"] | "focus",
  { label: string; icon: string; subtitle: string }
> = {
  inbox: {
    label: "Inbox",
    icon: "inbox",
    subtitle: "Capture and clarify",
  },
  next: {
    label: "Next Actions",
    icon: "bolt",
    subtitle: "To-do's for anytime",
  },
  waiting: {
    label: "Waiting For",
    icon: "schedule",
    subtitle: "Delegated or blocked",
  },
  calendar: {
    label: "Calendar",
    icon: "calendar_month",
    subtitle: "Scheduled actions",
  },
  someday: {
    label: "Someday / Maybe",
    icon: "cloud",
    subtitle: "When the time is right",
  },
  focus: {
    label: "Focus",
    icon: "center_focus_strong",
    subtitle: "Starred actions",
  },
};

export interface ThingListProps {
  bucket: Thing["bucket"] | "focus";
  things: Thing[];
  onAdd: (title: string) => Promise<void> | void;
  onComplete: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMove: (id: CanonicalId, bucket: string) => void;
  onArchive: (id: CanonicalId) => void;
  onEdit?: (id: CanonicalId, fields: Partial<ItemEditableFields>) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
  projects?: Pick<Project, "id" | "name">[];
  className?: string;
}

export function ThingList({
  bucket,
  things,
  onAdd,
  onComplete,
  onToggleFocus,
  onMove,
  onArchive,
  onEdit,
  onUpdateTitle,
  projects,
  className,
}: ThingListProps) {
  const [entryText, setEntryText] = useState("");
  const [expandedId, setExpandedId] = useState<CanonicalId | null>(null);
  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);
  const [prevBucket, setPrevBucket] = useState(bucket);
  const meta = bucketMeta[bucket];
  const isInbox = bucket === "inbox";
  const isFocusView = bucket === "focus";

  // Reset auto-expand flag and collapse all on bucket change (render-time state adjustment)
  if (prevBucket !== bucket) {
    setPrevBucket(bucket);
    setHasAutoExpanded(false);
    setExpandedId(null);
  }

  // Lazy-load completed items from the API when the toggle is active
  const completedQuery = useAllCompletedThings(showCompleted);

  const toggleExpand = useCallback((id: CanonicalId) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleAdd = useCallback(() => {
    const trimmed = entryText.trim();
    if (!trimmed) return;
    setCaptureError(null);
    setEntryText("");
    // Reset textarea height after clearing multiline content
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    inputRef.current?.focus();
    // Fire and forget — show error on failure but don't restore text
    Promise.resolve(onAdd(trimmed)).catch(() => {
      setCaptureError("Capture failed — please try again.");
    });
  }, [entryText, onAdd]);

  // Filter active items (active query never returns completed items)
  const filtered = useMemo(() => {
    if (isFocusView) {
      return things.filter((t) => t.isFocused);
    }
    return things.filter((t) => t.bucket === bucket);
  }, [things, bucket, isFocusView]);

  // Completed items — from the lazy-loaded completed query
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
      // Newest first — just-captured items appear on top
      return [...contextFiltered].sort(
        (a, b) =>
          new Date(b.provenance.createdAt).getTime() -
          new Date(a.provenance.createdAt).getTime(),
      );
    }
    // Actions: focused first, then sequenceOrder, then newest first
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

  // Auto-expand the first inbox item so triage buttons are immediately visible.
  // Computed during render (not in useEffect) to avoid cascading renders.
  if (bucket === "inbox" && sorted.length > 0) {
    const currentStillInList =
      expandedId && sorted.some((t) => t.id === expandedId);
    const userCollapsed = expandedId === null && hasAutoExpanded;
    if (!currentStillInList && !userCollapsed && expandedId !== sorted[0].id) {
      setHasAutoExpanded(true);
      setExpandedId(sorted[0].id);
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-text">
            <Icon name={meta.icon} size={22} />
            {meta.label}
          </h1>
          <p className="text-xs text-text-muted">{meta.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCompleted((prev) => !prev)}
          aria-label={showCompleted ? "Hide completed" : "Show completed"}
          aria-pressed={showCompleted}
          className={cn(
            "rounded-[var(--radius-md)] p-1.5 transition-colors duration-[var(--duration-fast)]",
            showCompleted
              ? "bg-blueprint-50 text-blueprint-500"
              : "text-text-subtle hover:bg-paper-100 hover:text-text",
          )}
        >
          <Icon
            name={
              completedQuery.isFetching
                ? "progress_activity"
                : showCompleted
                  ? "visibility"
                  : "visibility_off"
            }
            size={16}
          />
        </button>
      </div>

      {/* Rapid Entry / Capture */}
      {!isFocusView && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-text-subtle">
              <Icon name="add" size={16} />
            </span>
            <AutoGrowTextarea
              ref={inputRef}
              value={entryText}
              onChange={(e) => {
                setEntryText(e.currentTarget.value);
                if (captureError) setCaptureError(null);
              }}
              submitOnEnter
              onSubmit={handleAdd}
              placeholder={
                isInbox
                  ? "Capture a thought..."
                  : "Rapid Entry — type here and hit enter"
              }
              aria-label={isInbox ? "Capture a thought" : "Rapid entry"}
              className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-subtle"
            />
          </div>
          {captureError && (
            <p role="alert" className="pl-6 text-xs text-red-600">
              {captureError}
            </p>
          )}
        </div>
      )}

      {/* Context filter bar */}
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

      {/* Thing rows */}
      {sorted.length === 0 && !(showCompleted && completedItems.length > 0) ? (
        <div className="py-8 text-center">
          <p className="text-sm text-text-muted">
            {isInbox
              ? "Inbox is empty"
              : isFocusView
                ? "No focused actions"
                : "No actions here yet"}
          </p>
          {isInbox && (
            <p className="mt-1 text-xs text-text-subtle">
              Capture a thought to get started
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-0.5">
          {sorted.map((thing) => (
            <ThingRow
              key={thing.id}
              thing={thing}
              onComplete={onComplete}
              onToggleFocus={onToggleFocus}
              onMove={onMove}
              onArchive={onArchive}
              isExpanded={expandedId === thing.id}
              onToggleExpand={
                onEdit || onUpdateTitle
                  ? () => toggleExpand(thing.id)
                  : undefined
              }
              onEdit={onEdit}
              onUpdateTitle={onUpdateTitle}
              projects={projects}
              showBucket={isFocusView}
            />
          ))}
        </div>
      )}

      {/* Completed section */}
      {showCompleted && completedItems.length > 0 && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 pt-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-text-subtle">
              {completedItems.length} completed
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {completedItems.map((thing) => (
            <ThingRow
              key={thing.id}
              thing={thing}
              onComplete={onComplete}
              onToggleFocus={onToggleFocus}
              onMove={onMove}
              onArchive={onArchive}
              showBucket={isFocusView}
            />
          ))}
        </div>
      )}

      {/* Footer count */}
      {(sorted.length > 0 || (showCompleted && completedItems.length > 0)) && (
        <p className="text-center text-xs text-text-subtle">
          {sorted.length}{" "}
          {isInbox
            ? `item${sorted.length !== 1 ? "s" : ""} to process`
            : `action${sorted.length !== 1 ? "s" : ""}`}
          {showCompleted && completedItems.length > 0 && (
            <span> (+{completedItems.length} done)</span>
          )}
        </p>
      )}
    </div>
  );
}
