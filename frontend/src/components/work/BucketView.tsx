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
  activeBucket: Bucket;
  onBucketChange: (bucket: Bucket) => void;
  things: Thing[];
  referenceItems?: ReferenceMaterial[];
  projects?: Project[];
  onAddThing: (title: string, bucket: ThingBucket) => Promise<void> | void;
  onCompleteThing: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onMoveThing: (id: CanonicalId, bucket: string) => void;
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
  onCreateProject?: (name: string, desiredOutcome: string) => void;
  onSelectReference?: (id: CanonicalId) => void;
  className?: string;
}

export function BucketView({
  activeBucket,
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
  onCreateProject,
  onSelectReference,
  className,
}: BucketViewProps) {
  const [activeThing, setActiveThing] = useState<Thing | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const thing = event.active.data.current?.thing as Thing | undefined;
    setActiveThing(thing ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveThing(null);
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
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={cn("flex gap-6", className)}>
        <BucketNav
          activeBucket={activeBucket}
          onSelect={onBucketChange}
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
              onCreateProject={onCreateProject}
              onUpdateTitle={onUpdateTitle}
            />
          ) : null}
        </main>
      </div>
      <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
        {activeThing ? (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3 py-2 shadow-[var(--shadow-sheet)]">
            <Icon
              name="drag_indicator"
              size={14}
              className="text-text-subtle"
            />
            <span className="text-sm">{getDisplayName(activeThing)}</span>
            <BucketBadge bucket={activeThing.bucket} className="ml-auto" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
