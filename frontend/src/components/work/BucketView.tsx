import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { BucketBadge } from "@/components/paperclip/BucketBadge";
import { getDisplayName } from "@/model/types";
import { computeBucketCounts } from "@/lib/bucket-counts";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { BucketNav } from "./BucketNav";
import { ActionList } from "./ActionList";
import { ReferenceList } from "./ReferenceList";
import { ProjectTree } from "./ProjectTree";
import type {
  Bucket,
  ActionItem,
  ActionItemBucket,
  AppItem,
  Project,
  ReferenceMaterial,
  ItemEditableFields,
} from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

const thingBuckets = new Set<string>([
  "inbox",
  "next",
  "waiting",
  "calendar",
  "someday",
  "focus",
]);

export interface BucketViewProps {
  activeBucket: Bucket;
  onBucketChange: (bucket: Bucket) => void;
  actionItems: ActionItem[];
  referenceItems?: ReferenceMaterial[];
  projects?: Project[];
  onAddActionItem: (
    title: string,
    bucket: ActionItemBucket,
  ) => Promise<void> | void;
  onCompleteActionItem: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMoveActionItem: (
    id: CanonicalId,
    bucket: string,
    projectId?: CanonicalId,
  ) => void;
  onArchiveActionItem: (id: CanonicalId) => void;
  onEditActionItem?: (
    id: CanonicalId,
    fields: Partial<ItemEditableFields>,
  ) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
  onAddReference?: (title: string) => void;
  onArchiveReference?: (id: CanonicalId) => void;
  onEditReference?: (
    id: CanonicalId,
    fields: Partial<ItemEditableFields>,
  ) => void;
  onAddProjectAction?: (projectId: CanonicalId, title: string) => void;
  onCreateProject?: (name: string, desiredOutcome: string) => void;
  onSelectReference?: (id: CanonicalId) => void;
  /** Called when files are dropped onto the inbox area. */
  onFileDrop?: (files: File[]) => void;
  /** Called when user clicks the ReadAction "Read" subtitle to navigate to its reference. */
  onNavigateToReference?: (refId: CanonicalId) => void;
  /** Map from reference canonical ID → bucket of the linked ReadAction. */
  linkedActionBuckets?: Map<CanonicalId, ActionItemBucket>;
  className?: string;
}

export function BucketView({
  activeBucket,
  onBucketChange,
  actionItems,
  referenceItems = [],
  projects = [],
  onAddActionItem,
  onCompleteActionItem,
  onToggleFocus,
  onMoveActionItem,
  onArchiveActionItem,
  onEditActionItem,
  onUpdateTitle,
  onAddReference,
  onArchiveReference,
  onEditReference,
  onAddProjectAction,
  onCreateProject,
  onSelectReference,
  onFileDrop,
  onNavigateToReference,
  linkedActionBuckets,
  className,
}: BucketViewProps) {
  const isMobile = useIsMobile();
  const [activeItem, setActiveItem] = useState<
    (ActionItem | ReferenceMaterial) | null
  >(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const item = event.active.data.current?.thing as AppItem | undefined;
    if (item && "bucket" in item) {
      setActiveItem(item as ActionItem | ReferenceMaterial);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveItem(null);
      const { active, over } = event;
      if (!over) return;
      const targetBucket = over.data.current?.bucket as string | undefined;
      if (!targetBucket) return;

      // Focus is a view filter, not a bucket — toggle the focus flag
      if (targetBucket === "focus") {
        onToggleFocus(active.id as CanonicalId);
        return;
      }

      const projectId = over.data.current?.projectId as CanonicalId | undefined;
      onMoveActionItem(active.id as CanonicalId, targetBucket, projectId);
    },
    [onMoveActionItem, onToggleFocus],
  );

  const counts = computeBucketCounts(actionItems, referenceItems, projects);

  return (
    <DndContext
      onDragStart={isMobile ? undefined : handleDragStart}
      onDragEnd={isMobile ? undefined : handleDragEnd}
      sensors={isMobile ? [] : undefined}
    >
      <div className={cn("flex gap-6", className)}>
        <BucketNav
          activeBucket={activeBucket}
          onSelect={onBucketChange}
          counts={counts}
          projects={projects}
          className="hidden w-56 shrink-0 md:block"
        />

        <main className="min-w-0 flex-1" aria-label="Bucket content">
          {thingBuckets.has(activeBucket) ? (
            <ActionList
              bucket={activeBucket as ActionItemBucket | "focus"}
              items={actionItems}
              onAdd={(title) => {
                const bucket =
                  activeBucket === "focus"
                    ? "next"
                    : (activeBucket as ActionItemBucket);
                return onAddActionItem(title, bucket);
              }}
              onComplete={onCompleteActionItem}
              onToggleFocus={onToggleFocus}
              onMove={onMoveActionItem}
              onArchive={onArchiveActionItem}
              onEdit={onEditActionItem}
              onUpdateTitle={onUpdateTitle}
              onFileDrop={onFileDrop}
              onNavigateToReference={onNavigateToReference}
              projects={projects}
            />
          ) : activeBucket === "reference" ? (
            <ReferenceList
              references={referenceItems}
              onAdd={onAddReference ?? (() => {})}
              onArchive={onArchiveReference ?? (() => {})}
              onSelect={onSelectReference ?? (() => {})}
              onEditReference={onEditReference}
              linkedActionBuckets={linkedActionBuckets}
              projects={projects}
            />
          ) : activeBucket === "project" ? (
            <ProjectTree
              projects={projects}
              actions={actionItems.filter((t) => t.bucket !== "inbox")}
              references={referenceItems}
              onCompleteAction={onCompleteActionItem}
              onToggleFocus={onToggleFocus}
              onAddAction={onAddProjectAction ?? (() => {})}
              onCreateProject={onCreateProject}
              onUpdateTitle={onUpdateTitle}
            />
          ) : null}
        </main>
      </div>
      <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
        {activeItem ? (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3 py-2 shadow-[var(--shadow-sheet)]">
            <Icon
              name="drag_indicator"
              size={14}
              className="text-text-subtle"
            />
            <span className="text-sm">{getDisplayName(activeItem)}</span>
            <BucketBadge bucket={activeItem.bucket} className="ml-auto" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
