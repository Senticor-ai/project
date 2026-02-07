import { useCallback, useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { BucketNav } from "./BucketNav";
import { InboxList } from "./InboxList";
import { ActionList } from "./ActionList";
import { ReferenceList } from "./ReferenceList";
import { ProjectTree } from "./ProjectTree";
import type {
  GtdBucket,
  Action,
  InboxItem as InboxItemType,
  Project,
  ReferenceMaterial,
  TriageResult,
  ItemEditableFields,
} from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";

const actionBuckets = new Set<string>([
  "next",
  "waiting",
  "calendar",
  "someday",
  "focus",
]);

export interface BucketViewProps {
  initialBucket?: GtdBucket;
  /** When set, overrides internal bucket state (controlled mode). */
  requestedBucket?: GtdBucket | null;
  /** Called whenever the active bucket changes (user click or external navigation). */
  onBucketChange?: (bucket: GtdBucket) => void;
  actions: Action[];
  inboxItems: InboxItemType[];
  referenceItems?: ReferenceMaterial[];
  projects?: Project[];
  onCaptureInbox: (text: string) => void;
  onTriageInbox: (item: InboxItemType, result: TriageResult) => void;
  onAddAction: (title: string, bucket: Action["bucket"]) => void;
  onCompleteAction: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMoveAction: (id: CanonicalId, bucket: Action["bucket"]) => void;
  onEditAction?: (id: CanonicalId, fields: Partial<ItemEditableFields>) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
  onAddReference?: (title: string) => void;
  onArchiveReference?: (id: CanonicalId) => void;
  onAddProjectAction?: (projectId: CanonicalId, title: string) => void;
  onSelectAction?: (id: CanonicalId) => void;
  onSelectReference?: (id: CanonicalId) => void;
  className?: string;
}

export function BucketView({
  initialBucket = "inbox",
  requestedBucket,
  onBucketChange,
  actions,
  inboxItems,
  referenceItems = [],
  projects = [],
  onCaptureInbox,
  onTriageInbox,
  onAddAction,
  onCompleteAction,
  onToggleFocus,
  onMoveAction,
  onEditAction,
  onUpdateTitle,
  onAddReference,
  onArchiveReference,
  onAddProjectAction,
  onSelectAction,
  onSelectReference,
  className,
}: BucketViewProps) {
  const [activeBucket, setActiveBucketRaw] = useState<GtdBucket>(initialBucket);
  const [prevRequestedBucket, setPrevRequestedBucket] = useState<
    GtdBucket | null | undefined
  >(null);

  // Adjust state during render when parent requests a new bucket
  // (official React pattern: https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  if (requestedBucket && requestedBucket !== prevRequestedBucket) {
    setPrevRequestedBucket(requestedBucket);
    setActiveBucketRaw(requestedBucket);
  }
  if (!requestedBucket && prevRequestedBucket) {
    setPrevRequestedBucket(null);
  }

  const setActiveBucket = useCallback(
    (bucket: GtdBucket) => {
      setActiveBucketRaw(bucket);
      onBucketChange?.(bucket);
    },
    [onBucketChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const targetBucket = over.data.current?.bucket as
        | Action["bucket"]
        | undefined;
      if (!targetBucket) return;
      onMoveAction(active.id as CanonicalId, targetBucket);
    },
    [onMoveAction],
  );

  const counts: Partial<Record<GtdBucket, number>> = {
    inbox: inboxItems.length,
    focus: actions.filter((a) => a.isFocused && !a.completedAt).length,
    next: actions.filter((a) => a.bucket === "next" && !a.completedAt).length,
    waiting: actions.filter((a) => a.bucket === "waiting" && !a.completedAt)
      .length,
    calendar: actions.filter((a) => a.bucket === "calendar" && !a.completedAt)
      .length,
    someday: actions.filter((a) => a.bucket === "someday" && !a.completedAt)
      .length,
    reference: referenceItems.filter((r) => !r.provenance.archivedAt).length,
    project: projects.filter((p) => p.status === "active").length,
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className={cn("flex gap-6", className)}>
        <BucketNav
          activeBucket={activeBucket}
          onSelect={setActiveBucket}
          counts={counts}
          className="w-56 shrink-0"
        />

        <main className="min-w-0 flex-1" aria-label="Bucket content">
          {activeBucket === "inbox" ? (
            <InboxList
              items={inboxItems}
              projects={projects}
              onCapture={onCaptureInbox}
              onTriage={onTriageInbox}
              onUpdateTitle={
                onUpdateTitle
                  ? (item, newTitle) => onUpdateTitle(item.id, newTitle)
                  : undefined
              }
            />
          ) : actionBuckets.has(activeBucket) ? (
            <ActionList
              bucket={activeBucket as Action["bucket"] | "focus"}
              actions={actions}
              onAdd={(title) => {
                const bucket =
                  activeBucket === "focus"
                    ? "next"
                    : (activeBucket as Action["bucket"]);
                onAddAction(title, bucket);
              }}
              onComplete={onCompleteAction}
              onToggleFocus={onToggleFocus}
              onMove={onMoveAction}
              onSelect={onSelectAction ?? (() => {})}
              onEditAction={onEditAction}
              onUpdateTitle={onUpdateTitle}
              projects={projects}
            />
          ) : activeBucket === "reference" ? (
            <ReferenceList
              references={referenceItems}
              onAdd={onAddReference ?? (() => {})}
              onArchive={onArchiveReference ?? (() => {})}
              onSelect={onSelectReference ?? (() => {})}
            />
          ) : activeBucket === "project" ? (
            <ProjectTree
              projects={projects}
              actions={actions}
              onCompleteAction={onCompleteAction}
              onToggleFocus={onToggleFocus}
              onAddAction={onAddProjectAction ?? (() => {})}
              onSelectAction={onSelectAction}
              onUpdateTitle={onUpdateTitle}
            />
          ) : null}
        </main>
      </div>
    </DndContext>
  );
}
