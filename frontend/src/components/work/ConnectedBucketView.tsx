import { useCallback, useState, useEffect, useMemo } from "react";
import { BucketView } from "./BucketView";
import { useAllItems, useProjects, useReferences } from "@/hooks/use-items";
import { useOrganizations } from "@/hooks/use-organizations";
import {
  useCaptureInbox,
  useCaptureFile,
  useAddAction,
  useCompleteAction,
  useToggleFocus,
  useMoveAction,
  useAddReference,
  useArchiveReference,
  useUpdateItem,
  useAddProjectAction,
  useCreateProject,
} from "@/hooks/use-mutations";
import { Icon } from "@/components/ui/Icon";
import { buildItemEditPatch } from "@/lib/item-serializer";
import type { ActionItemBucket, ItemEditableFields } from "@/model/types";
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
  const actionItemsQuery = useAllItems();
  const projectsQuery = useProjects();
  const referencesQuery = useReferences();
  const orgsQuery = useOrganizations();

  const captureMutation = useCaptureInbox();
  const captureFileMutation = useCaptureFile();
  const addActionMutation = useAddAction();
  const completeMutation = useCompleteAction();
  const focusMutation = useToggleFocus();
  const moveMutation = useMoveAction();
  const addRefMutation = useAddReference();
  const archiveRefMutation = useArchiveReference();
  const updateItemMutation = useUpdateItem();
  const addProjectActionMutation = useAddProjectAction();
  const createProjectMutation = useCreateProject();

  const isLoading =
    actionItemsQuery.isLoading ||
    projectsQuery.isLoading ||
    referencesQuery.isLoading;
  const isFetching =
    actionItemsQuery.isFetching ||
    projectsQuery.isFetching ||
    referencesQuery.isFetching;

  // Debounce isFetching — only show after 400ms to avoid flash on fast refetches
  const [showRefetch, setShowRefetch] = useState(false);
  useEffect(() => {
    if (!isFetching || isLoading) return;
    const timer = setTimeout(() => setShowRefetch(true), 400);
    return () => {
      clearTimeout(timer);
      setShowRefetch(false);
    };
  }, [isFetching, isLoading]);

  const error =
    actionItemsQuery.error ?? projectsQuery.error ?? referencesQuery.error;

  const handleAddActionItem = useCallback(
    async (title: string, bucket: ActionItemBucket) => {
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
    (id: CanonicalId, bucket: string, projectId?: CanonicalId) =>
      moveMutation.mutate({ canonicalId: id, bucket, projectId }),
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
        patch: { name: newTitle },
      }),
    [updateItemMutation],
  );

  const handleEditItem = useCallback(
    (id: CanonicalId, fields: Partial<ItemEditableFields>) =>
      updateItemMutation.mutate({
        canonicalId: id,
        patch: buildItemEditPatch(fields),
      }),
    [updateItemMutation],
  );

  const handleAddProjectAction = useCallback(
    (projectId: CanonicalId, title: string) =>
      addProjectActionMutation.mutate({ projectId, title }),
    [addProjectActionMutation],
  );

  const handleCreateProject = useCallback(
    (name: string, desiredOutcome: string) =>
      createProjectMutation.mutate({ name, desiredOutcome }),
    [createProjectMutation],
  );

  const handleFileDrop = useCallback(
    (files: File[]) => {
      for (const file of files) {
        captureFileMutation.mutate(file);
      }
    },
    [captureFileMutation],
  );

  const handleNavigateToReference = useCallback(() => {
    onBucketChange("reference");
  }, [onBucketChange]);

  // Derive map: reference canonical ID → bucket of the linked ReadAction
  const linkedActionBuckets = useMemo(() => {
    const map = new Map<CanonicalId, ActionItemBucket>();
    for (const item of actionItemsQuery.data ?? []) {
      if (item.objectRef) {
        map.set(item.objectRef, item.bucket);
      }
    }
    return map;
  }, [actionItemsQuery.data]);

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
        <Icon name="error" size={28} className="mx-auto text-status-error" />
        <p className="mt-2 text-sm text-text-muted">Failed to load data</p>
        <button
          onClick={() => {
            actionItemsQuery.refetch();
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
      {/* Background refetch indicator (e.g. after import) — debounced 400ms */}
      {showRefetch && (
        <div
          role="progressbar"
          aria-label="Refreshing data"
          className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse rounded-full bg-blueprint-400"
        />
      )}
      <BucketView
        actionItems={actionItemsQuery.data ?? []}
        referenceItems={referencesQuery.data ?? []}
        projects={projectsQuery.data ?? []}
        activeBucket={activeBucket}
        onBucketChange={onBucketChange}
        onAddActionItem={handleAddActionItem}
        onCompleteActionItem={handleComplete}
        onToggleFocus={handleToggleFocus}
        onMoveActionItem={handleMove}
        onArchiveActionItem={handleArchive}
        onEditActionItem={handleEditItem}
        onUpdateTitle={handleUpdateTitle}
        onAddReference={handleAddReference}
        onArchiveReference={handleArchiveReference}
        onAddProjectAction={handleAddProjectAction}
        onCreateProject={handleCreateProject}
        onEditReference={handleEditItem}
        onEditProject={handleEditItem}
        onFileDrop={handleFileDrop}
        onNavigateToReference={handleNavigateToReference}
        linkedActionBuckets={linkedActionBuckets}
        organizations={orgsQuery.data}
      />
    </div>
  );
}
