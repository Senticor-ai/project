import { useCallback } from "react";
import { BucketView } from "./BucketView";
import { useAllThings, useProjects, useReferences } from "@/hooks/use-things";
import {
  useCaptureInbox,
  useAddAction,
  useCompleteAction,
  useToggleFocus,
  useMoveAction,
  useAddReference,
  useArchiveReference,
  useUpdateItem,
  useAddProjectAction,
} from "@/hooks/use-mutations";
import { Icon } from "@/components/ui/Icon";
import type { ThingBucket, ItemEditableFields } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";
import { cn } from "@/lib/utils";

import type { Bucket } from "@/model/types";

export interface ConnectedBucketViewProps {
  activeBucket: Bucket;
  onBucketChange: (bucket: Bucket) => void;
  className?: string;
}

export function ConnectedBucketView({
  activeBucket,
  onBucketChange,
  className,
}: ConnectedBucketViewProps) {
  const thingsQuery = useAllThings();
  const projectsQuery = useProjects();
  const referencesQuery = useReferences();

  const captureMutation = useCaptureInbox();
  const addActionMutation = useAddAction();
  const completeMutation = useCompleteAction();
  const focusMutation = useToggleFocus();
  const moveMutation = useMoveAction();
  const addRefMutation = useAddReference();
  const archiveRefMutation = useArchiveReference();
  const updateItemMutation = useUpdateItem();
  const addProjectActionMutation = useAddProjectAction();

  const isLoading =
    thingsQuery.isLoading ||
    projectsQuery.isLoading ||
    referencesQuery.isLoading;
  const isFetching =
    thingsQuery.isFetching ||
    projectsQuery.isFetching ||
    referencesQuery.isFetching;
  const error =
    thingsQuery.error ?? projectsQuery.error ?? referencesQuery.error;

  const handleAddThing = useCallback(
    async (title: string, bucket: ThingBucket) => {
      if (bucket === "inbox") {
        await captureMutation.mutateAsync(title);
      } else {
        await addActionMutation.mutateAsync({ title, bucket });
      }
    },
    [captureMutation, addActionMutation],
  );

  const handleComplete = useCallback(
    (id: CanonicalId) => completeMutation.mutate(id),
    [completeMutation],
  );

  const handleToggleFocus = useCallback(
    (id: CanonicalId) => focusMutation.mutate(id),
    [focusMutation],
  );

  const handleMove = useCallback(
    (id: CanonicalId, bucket: ThingBucket) =>
      moveMutation.mutate({ canonicalId: id, bucket }),
    [moveMutation],
  );

  const handleArchive = useCallback(
    (id: CanonicalId) => archiveRefMutation.mutate(id),
    [archiveRefMutation],
  );

  const handleAddReference = useCallback(
    (title: string) => addRefMutation.mutate(title),
    [addRefMutation],
  );

  const handleArchiveReference = useCallback(
    (id: CanonicalId) => archiveRefMutation.mutate(id),
    [archiveRefMutation],
  );

  const handleUpdateTitle = useCallback(
    (id: CanonicalId, newTitle: string) =>
      updateItemMutation.mutate({
        canonicalId: id,
        patch: { title: newTitle },
      }),
    [updateItemMutation],
  );

  const handleEditItem = useCallback(
    (id: CanonicalId, fields: Partial<ItemEditableFields>) =>
      updateItemMutation.mutate({ canonicalId: id, patch: fields }),
    [updateItemMutation],
  );

  const handleAddProjectAction = useCallback(
    (projectId: CanonicalId, title: string) =>
      addProjectActionMutation.mutate({ projectId, title }),
    [addProjectActionMutation],
  );

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-20", className)}>
        <Icon
          name="progress_activity"
          size={28}
          className="animate-spin text-blueprint-500"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("py-12 text-center", className)}>
        <Icon name="error" size={28} className="mx-auto text-red-600" />
        <p className="mt-2 text-sm text-text-muted">Failed to load data</p>
        <button
          onClick={() => {
            thingsQuery.refetch();
          }}
          className="mt-3 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs hover:bg-paper-100"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Background refetch indicator (e.g. after import) */}
      {isFetching && !isLoading && (
        <div
          role="progressbar"
          aria-label="Refreshing data"
          className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse rounded-full bg-blueprint-400"
        />
      )}
      <BucketView
        things={thingsQuery.data ?? []}
        referenceItems={referencesQuery.data ?? []}
        projects={projectsQuery.data ?? []}
        activeBucket={activeBucket}
        onBucketChange={onBucketChange}
        onAddThing={handleAddThing}
        onCompleteThing={handleComplete}
        onToggleFocus={handleToggleFocus}
        onMoveThing={handleMove}
        onArchiveThing={handleArchive}
        onEditThing={handleEditItem}
        onUpdateTitle={handleUpdateTitle}
        onAddReference={handleAddReference}
        onArchiveReference={handleArchiveReference}
        onAddProjectAction={handleAddProjectAction}
        onEditReference={handleEditItem}
      />
    </div>
  );
}
