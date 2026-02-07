import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { ReferenceRow } from "./ReferenceRow";
import type { ReferenceMaterial } from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";

export interface ReferenceListProps {
  references: ReferenceMaterial[];
  onAdd: (title: string) => void;
  onArchive: (id: CanonicalId) => void;
  onSelect: (id: CanonicalId) => void;
  className?: string;
}

export function ReferenceList({
  references,
  onAdd,
  onArchive,
  onSelect,
  className,
}: ReferenceListProps) {
  const [entryText, setEntryText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(() => {
    const trimmed = entryText.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setEntryText("");
    inputRef.current?.focus();
  }, [entryText, onAdd]);

  const filtered = references.filter((r) => !r.provenance.archivedAt);

  const sorted = [...filtered].sort(
    (a, b) =>
      new Date(b.provenance.createdAt).getTime() -
      new Date(a.provenance.createdAt).getTime(),
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-text">
          <Icon name="book" size={22} />
          Reference
        </h1>
        <p className="text-xs text-text-muted">Knowledge base & materials</p>
      </div>

      {/* Rapid Entry */}
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
          placeholder="Add reference — type and press Enter"
          aria-label="Rapid entry"
          className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-subtle"
        />
      </div>

      {/* Reference rows */}
      {sorted.length === 0 ? (
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
            />
          ))}
        </div>
      )}

      {/* Footer count */}
      {sorted.length > 0 && (
        <p className="text-center text-xs text-text-subtle">
          {sorted.length} reference{sorted.length !== 1 && "s"}
        </p>
      )}
    </div>
  );
}
