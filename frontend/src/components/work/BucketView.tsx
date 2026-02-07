import { useCallback, useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { BucketNav } from "./BucketNav";
import { ThingList } from "./ThingList";
import { ReferenceList } from "./ReferenceList";
import { ProjectTree } from "./ProjectTree";
import type {
  Bucket,
  Thing,
  ThingBucket,
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
  initialBucket?: Bucket;
  /** When set, overrides internal bucket state (controlled mode). */
  requestedBucket?: Bucket | null;
  /** Called whenever the active bucket changes (user click or external navigation). */
  onBucketChange?: (bucket: Bucket) => void;
  things: Thing[];
  referenceItems?: ReferenceMaterial[];
  projects?: Project[];
  onAddThing: (title: string, bucket: ThingBucket) => Promise<void> | void;
  onCompleteThing: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMoveThing: (id: CanonicalId, bucket: ThingBucket) => void;
  onArchiveThing: (id: CanonicalId) => void;
  onEditThing?: (id: CanonicalId, fields: Partial<ItemEditableFields>) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
  onAddReference?: (title: string) => void;
  onArchiveReference?: (id: CanonicalId) => void;
  onEditReference?: (
    id: CanonicalId,
    fields: Partial<ItemEditableFields>,
  ) => void;
  onAddProjectAction?: (projectId: CanonicalId, title: string) => void;
  onSelectReference?: (id: CanonicalId) => void;
  className?: string;
}

export function BucketView({
  initialBucket = "inbox",
  requestedBucket,
  onBucketChange,
  things,
  referenceItems = [],
  projects = [],
  onAddThing,
  onCompleteThing,
  onToggleFocus,
  onMoveThing,
  onArchiveThing,
  onEditThing,
  onUpdateTitle,
  onAddReference,
  onArchiveReference,
  onEditReference,
  onAddProjectAction,
  onSelectReference,
  className,
}: BucketViewProps) {
  const [activeBucket, setActiveBucketRaw] = useState<Bucket>(initialBucket);
  const [prevRequestedBucket, setPrevRequestedBucket] = useState<
    Bucket | null | undefined
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
    (bucket: Bucket) => {
      setActiveBucketRaw(bucket);
      onBucketChange?.(bucket);
    },
    [onBucketChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const targetBucket = over.data.current?.bucket as ThingBucket | undefined;
      if (!targetBucket) return;

      onMoveThing(active.id as CanonicalId, targetBucket);
    },
    [onMoveThing],
  );

  const counts: Partial<Record<Bucket, number>> = {
    inbox: things.filter((t) => t.bucket === "inbox" && !t.completedAt).length,
    focus: things.filter((t) => t.isFocused && !t.completedAt).length,
    next: things.filter((t) => t.bucket === "next" && !t.completedAt).length,
    waiting: things.filter((t) => t.bucket === "waiting" && !t.completedAt)
      .length,
    calendar: things.filter((t) => t.bucket === "calendar" && !t.completedAt)
      .length,
    someday: things.filter((t) => t.bucket === "someday" && !t.completedAt)
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
          {thingBuckets.has(activeBucket) ? (
            <ThingList
              bucket={activeBucket as ThingBucket | "focus"}
              things={things}
              onAdd={(title) => {
                const bucket =
                  activeBucket === "focus"
                    ? "next"
                    : (activeBucket as ThingBucket);
                return onAddThing(title, bucket);
              }}
              onComplete={onCompleteThing}
              onToggleFocus={onToggleFocus}
              onMove={onMoveThing}
              onArchive={onArchiveThing}
              onEdit={onEditThing}
              onUpdateTitle={onUpdateTitle}
              projects={projects}
            />
          ) : activeBucket === "reference" ? (
            <ReferenceList
              references={referenceItems}
              onAdd={onAddReference ?? (() => {})}
              onArchive={onArchiveReference ?? (() => {})}
              onSelect={onSelectReference ?? (() => {})}
              onEditReference={onEditReference}
            />
          ) : activeBucket === "project" ? (
            <ProjectTree
              projects={projects}
              actions={things.filter((t) => t.bucket !== "inbox")}
              onCompleteAction={onCompleteThing}
              onToggleFocus={onToggleFocus}
              onAddAction={onAddProjectAction ?? (() => {})}
              onUpdateTitle={onUpdateTitle}
            />
          ) : null}
        </main>
      </div>
    </DndContext>
  );
}
