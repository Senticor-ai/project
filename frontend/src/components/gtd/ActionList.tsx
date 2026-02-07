import { useState, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { ActionRow } from "./ActionRow";
import { ContextFilterBar } from "./ContextFilterBar";
import type { Action, Project, ItemEditableFields } from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";

const bucketMeta: Record<
  Action["bucket"] | "focus",
  { label: string; icon: string; subtitle: string }
> = {
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

export interface ActionListProps {
  bucket: Action["bucket"] | "focus";
  actions: Action[];
  onAdd: (title: string) => void;
  onComplete: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMove: (id: CanonicalId, bucket: Action["bucket"]) => void;
  onSelect: (id: CanonicalId) => void;
  onEditAction?: (id: CanonicalId, fields: Partial<ItemEditableFields>) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
  projects?: Pick<Project, "id" | "title">[];
  className?: string;
}

export function ActionList({
  bucket,
  actions,
  onAdd,
  onComplete,
  onToggleFocus,
  onMove,
  onSelect,
  onEditAction,
  onUpdateTitle,
  projects,
  className,
}: ActionListProps) {
  const [entryText, setEntryText] = useState("");
  const [expandedId, setExpandedId] = useState<CanonicalId | null>(null);
  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = bucketMeta[bucket];

  const toggleExpand = useCallback((id: CanonicalId) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleAdd = useCallback(() => {
    const trimmed = entryText.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setEntryText("");
    inputRef.current?.focus();
  }, [entryText, onAdd]);

  // Filter: focus view shows only focused items from any bucket
  const filtered =
    bucket === "focus"
      ? actions.filter((a) => a.isFocused && !a.completedAt)
      : actions.filter((a) => a.bucket === bucket && !a.completedAt);

  // Context counts (pre-filter, for stable badge numbers)
  const contextCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const action of filtered) {
      for (const ctx of action.contexts as unknown as string[]) {
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
      ? filtered.filter((a) =>
          (a.contexts as unknown as string[]).some((c) =>
            selectedContexts.includes(c),
          ),
        )
      : filtered;

  // Sort: focused first, then sequenceOrder, then createdAt
  const sorted = [...contextFiltered].sort((a, b) => {
    if (a.isFocused !== b.isFocused) return a.isFocused ? -1 : 1;
    if (a.sequenceOrder != null && b.sequenceOrder != null)
      return a.sequenceOrder - b.sequenceOrder;
    return (
      new Date(a.provenance.createdAt).getTime() -
      new Date(b.provenance.createdAt).getTime()
    );
  });

  const isFocusView = bucket === "focus";

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-text">
          <Icon name={meta.icon} size={22} />
          {meta.label}
        </h1>
        <p className="text-xs text-text-muted">{meta.subtitle}</p>
      </div>

      {/* Rapid Entry */}
      {!isFocusView && (
        <div className="flex items-center gap-2">
          <span className="text-text-subtle">
            <Icon name="add" size={16} />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={entryText}
            onChange={(e) => setEntryText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Rapid Entry — type here and hit enter"
            aria-label="Rapid entry"
            className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-subtle"
          />
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

      {/* Action rows */}
      {sorted.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-text-muted">
            {isFocusView ? "No focused actions" : "No actions here yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {sorted.map((action) => (
            <ActionRow
              key={action.id}
              action={action}
              onComplete={onComplete}
              onToggleFocus={onToggleFocus}
              onMove={onMove}
              onSelect={onSelect}
              isExpanded={expandedId === action.id}
              onToggleExpand={
                onEditAction || onUpdateTitle
                  ? () => toggleExpand(action.id)
                  : undefined
              }
              onEdit={onEditAction}
              onUpdateTitle={onUpdateTitle}
              projects={projects}
              showBucket={isFocusView}
            />
          ))}
        </div>
      )}

      {/* Footer count */}
      {sorted.length > 0 && (
        <p className="text-center text-xs text-text-subtle">
          {sorted.length} action{sorted.length !== 1 && "s"}
        </p>
      )}
    </div>
  );
}
