import { useState, useMemo } from "react";
import { ItemList } from "./ItemList";
import { ReferenceRow } from "./ReferenceRow";
import type { ReferenceMaterial, ItemEditableFields } from "@/model/types";
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
  const [expandedId, setExpandedId] = useState<CanonicalId | null>(null);

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
    <ItemList<ReferenceMaterial>
      items={sorted}
      header={{
        icon: "book",
        label: "Reference",
        subtitle: "Knowledge base & materials",
      }}
      rapidEntry={{
        placeholder: "Add reference — type and press Enter",
        ariaLabel: "Rapid entry",
        onAdd,
      }}
      renderItem={(ref, { isExpanded, onToggleExpand }) => (
        <ReferenceRow
          key={ref.id}
          reference={ref}
          onArchive={onArchive}
          onSelect={onSelect}
          isExpanded={isExpanded}
          onToggleExpand={onEditReference ? onToggleExpand : undefined}
          onEdit={onEditReference}
        />
      )}
      emptyMessage="No reference items yet"
      footer={{
        formatCount: (count) => `${count} reference${count !== 1 ? "s" : ""}`,
      }}
      secondarySection={
        archivedItems.length > 0
          ? {
              label: "Archived",
              items: archivedItems,
              renderItem: (ref) => (
                <ReferenceRow
                  key={ref.id}
                  reference={ref}
                  onArchive={onArchive}
                  onSelect={onSelect}
                />
              ),
              wrapperClassName: "opacity-60",
            }
          : undefined
      }
      expandedId={expandedId}
      onExpandedIdChange={setExpandedId}
      className={className}
    />
  );
}
