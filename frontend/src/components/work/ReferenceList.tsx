import { useState, useMemo } from "react";
import { Icon } from "@/components/ui/Icon";
import { ItemList } from "./ItemList";
import { ReferenceRow } from "./ReferenceRow";
import type {
  ReferenceMaterial,
  ItemEditableFields,
  ActionItemBucket,
  Project,
} from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

const UNASSIGNED_KEY = "__unassigned__";

interface OrgGroup {
  id: string;
  name: string;
  items: ReferenceMaterial[];
}

export interface ReferenceListProps {
  references: ReferenceMaterial[];
  /** When provided, references are grouped by orgRef. */
  organizations?: { id: string; name: string }[];
  onAdd: (title: string) => void;
  onArchive: (id: CanonicalId) => void;
  onSelect: (id: CanonicalId) => void;
  onEditReference?: (
    id: CanonicalId,
    fields: Partial<ItemEditableFields>,
  ) => void;
  /** Map from reference canonical ID → bucket of the linked ReadAction. */
  linkedActionBuckets?: Map<CanonicalId, ActionItemBucket>;
  projects?: Pick<Project, "id" | "name">[];
  className?: string;
}

function sortNewestFirst(items: ReferenceMaterial[]): ReferenceMaterial[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.provenance.createdAt).getTime() -
      new Date(a.provenance.createdAt).getTime(),
  );
}

export function ReferenceList({
  references,
  organizations,
  onAdd,
  onArchive,
  onSelect,
  onEditReference,
  linkedActionBuckets,
  projects,
  className,
}: ReferenceListProps) {
  const [expandedId, setExpandedId] = useState<CanonicalId | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  const filtered = references.filter((r) => !r.provenance.archivedAt);
  const sorted = sortNewestFirst(filtered);

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

  const orgGroups = useMemo((): OrgGroup[] | null => {
    if (!organizations || organizations.length === 0) return null;

    const byOrg = new Map<string, ReferenceMaterial[]>();
    const unassigned: ReferenceMaterial[] = [];

    for (const ref of sorted) {
      if (ref.orgRef) {
        const list = byOrg.get(ref.orgRef.id) ?? [];
        list.push(ref);
        byOrg.set(ref.orgRef.id, list);
      } else {
        unassigned.push(ref);
      }
    }

    // Alphabetical by org name
    const groups: OrgGroup[] = organizations
      .filter((o) => byOrg.has(o.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((o) => ({
        id: o.id,
        name: o.name,
        items: byOrg.get(o.id)!,
      }));

    if (unassigned.length > 0) {
      groups.push({
        id: UNASSIGNED_KEY,
        name: "Unassigned",
        items: unassigned,
      });
    }

    return groups;
  }, [organizations, sorted]);

  const renderRef = (
    ref: ReferenceMaterial,
    isExpanded: boolean,
    onToggleExpand: (() => void) | undefined,
  ) => (
    <ReferenceRow
      key={ref.id}
      reference={ref}
      onArchive={onArchive}
      onSelect={onSelect}
      isExpanded={isExpanded}
      onToggleExpand={onEditReference ? onToggleExpand : undefined}
      onEdit={onEditReference}
      linkedActionBucket={linkedActionBuckets?.get(ref.id)}
      projects={projects}
      organizations={organizations}
    />
  );

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Grouped rendering — pass sorted items for count/empty-state but render
  // them via beforeItems grouped by org; renderItem returns null to avoid
  // duplicate rendering (the wrapping div is harmless).
  if (orgGroups) {
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
        renderItem={() => null}
        emptyMessage="No reference items yet"
        footer={{
          formatCount: (count) => `${count} reference${count !== 1 ? "s" : ""}`,
        }}
        beforeItems={
          sorted.length > 0 ? (
            <div className="space-y-3">
              {orgGroups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.id);
                return (
                  <div key={group.id} className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={!isCollapsed}
                      aria-label={
                        isCollapsed
                          ? `Expand ${group.name}`
                          : `Collapse ${group.name}`
                      }
                      className="flex items-center gap-1.5 py-1 text-xs font-medium text-text-subtle transition-colors hover:text-text"
                    >
                      <Icon
                        name={isCollapsed ? "chevron_right" : "expand_more"}
                        size={16}
                      />
                      <Icon name="apartment" size={14} />
                      <span>
                        {group.name} ({group.items.length})
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-0.5 pl-1">
                        {group.items.map((ref) =>
                          renderRef(ref, expandedId === ref.id, () =>
                            setExpandedId(
                              expandedId === ref.id ? null : ref.id,
                            ),
                          ),
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : undefined
        }
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

  // Flat rendering (no organizations)
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
      renderItem={(ref, { isExpanded, onToggleExpand }) =>
        renderRef(ref, isExpanded, onToggleExpand)
      }
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
