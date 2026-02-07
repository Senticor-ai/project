import { useState, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { ReferenceRow } from "./ReferenceRow";
import type { ReferenceMaterial, ItemEditableFields } from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";

export interface ReferenceListProps {
  references: ReferenceMaterial[];
  onAdd: (title: string) => void;
  onArchive: (id: CanonicalId) => void;
  onSelect: (id: CanonicalId) => void;
  onEditReference?: (
    id: CanonicalId,
    fields: Partial<ItemEditableFields>,
  ) => void;
  className?: string;
}

export function ReferenceList({
  references,
  onAdd,
  onArchive,
  onSelect,
  onEditReference,
  className,
}: ReferenceListProps) {
  const [entryText, setEntryText] = useState("");
  const [expandedId, setExpandedId] = useState<CanonicalId | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const [showArchived, setShowArchived] = useState(false);

  const filtered = references.filter((r) => !r.provenance.archivedAt);

  const sorted = [...filtered].sort(
    (a, b) =>
      new Date(b.provenance.createdAt).getTime() -
      new Date(a.provenance.createdAt).getTime(),
  );

  const archivedItems = useMemo(
    () =>
      references
        .filter((r) => !!r.provenance.archivedAt)
        .sort(
          (a, b) =>
            new Date(b.provenance.archivedAt!).getTime() -
            new Date(a.provenance.archivedAt!).getTime(),
        ),
    [references],
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-text">
            <Icon name="book" size={22} />
            Reference
          </h1>
          <p className="text-xs text-text-muted">Knowledge base & materials</p>
        </div>
        {archivedItems.length > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((prev) => !prev)}
            aria-label={showArchived ? "Hide archived" : "Show archived"}
            aria-pressed={showArchived}
            className={cn(
              "rounded-[var(--radius-md)] p-1.5 transition-colors duration-[var(--duration-fast)]",
              showArchived
                ? "bg-blueprint-50 text-blueprint-500"
                : "text-text-subtle hover:bg-paper-100 hover:text-text",
            )}
          >
            <Icon
              name={showArchived ? "visibility" : "visibility_off"}
              size={16}
            />
          </button>
        )}
      </div>

      {/* Rapid Entry */}
      <div className="flex items-center gap-2">
        <span className="text-text-subtle">
          <Icon name="add" size={16} />
        </span>
        <AutoGrowTextarea
          ref={inputRef}
          value={entryText}
          onChange={(e) => setEntryText(e.currentTarget.value)}
          submitOnEnter
          onSubmit={handleAdd}
          placeholder="Add reference — type and press Enter"
          aria-label="Rapid entry"
          className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-subtle"
        />
      </div>

      {/* Reference rows */}
      {sorted.length === 0 && !(showArchived && archivedItems.length > 0) ? (
        <div className="py-8 text-center">
          <p className="text-sm text-text-muted">No reference items yet</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {sorted.map((ref) => (
            <ReferenceRow
              key={ref.id}
              reference={ref}
              onArchive={onArchive}
              onSelect={onSelect}
              isExpanded={expandedId === ref.id}
              onToggleExpand={
                onEditReference ? () => toggleExpand(ref.id) : undefined
              }
              onEdit={onEditReference}
            />
          ))}
        </div>
      )}

      {/* Archived section */}
      {showArchived && archivedItems.length > 0 && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 pt-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-text-subtle">
              {archivedItems.length} archived
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="opacity-60">
            {archivedItems.map((ref) => (
              <ReferenceRow
                key={ref.id}
                reference={ref}
                onArchive={onArchive}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer count */}
      {(sorted.length > 0 || (showArchived && archivedItems.length > 0)) && (
        <p className="text-center text-xs text-text-subtle">
          {sorted.length} reference{sorted.length !== 1 && "s"}
          {showArchived && archivedItems.length > 0 && (
            <span> (+{archivedItems.length} archived)</span>
          )}
        </p>
      )}
    </div>
  );
}
