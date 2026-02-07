import { useCallback } from "react";
import { BucketView } from "./BucketView";
import {
  useInboxItems,
  useActions,
  useProjects,
  useReferences,
} from "@/hooks/use-things";
import {
  useCaptureInbox,
  useTriageItem,
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
import type { InboxItem, Action, TriageResult } from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";
import { cn } from "@/lib/utils";

import type { GtdBucket } from "@/model/gtd-types";

export interface ConnectedBucketViewProps {
  /** When set, navigates BucketView to this bucket. */
  requestedBucket?: GtdBucket | null;
  onBucketChange?: (bucket: GtdBucket) => void;
  className?: string;
}

export function ConnectedBucketView({
  requestedBucket,
  onBucketChange,
  className,
}: ConnectedBucketViewProps) {
  const inboxQuery = useInboxItems();
  const actionsQuery = useActions();
  const projectsQuery = useProjects();
  const referencesQuery = useReferences();

  const captureMutation = useCaptureInbox();
  const triageMutation = useTriageItem();
  const addActionMutation = useAddAction();
  const completeMutation = useCompleteAction();
  const focusMutation = useToggleFocus();
  const moveMutation = useMoveAction();
  const addRefMutation = useAddReference();
  const archiveRefMutation = useArchiveReference();
  const updateItemMutation = useUpdateItem();
  const addProjectActionMutation = useAddProjectAction();

  const isLoading =
    inboxQuery.isLoading ||
    actionsQuery.isLoading ||
    projectsQuery.isLoading ||
    referencesQuery.isLoading;
  const isFetching =
    inboxQuery.isFetching ||
    actionsQuery.isFetching ||
    projectsQuery.isFetching ||
    referencesQuery.isFetching;
  const error =
    inboxQuery.error ??
    actionsQuery.error ??
    projectsQuery.error ??
    referencesQuery.error;

  const handleCapture = useCallback(
    (text: string) => captureMutation.mutate(text),
    [captureMutation],
  );

  const handleTriage = useCallback(
    (item: InboxItem, result: TriageResult) =>
      triageMutation.mutate({ item, result }),
    [triageMutation],
  );

  const handleAddAction = useCallback(
    (title: string, bucket: Action["bucket"]) => {
      addActionMutation.mutate({ title, bucket });
    },
    [addActionMutation],
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
    (id: CanonicalId, bucket: Action["bucket"]) =>
      moveMutation.mutate({ canonicalId: id, bucket }),
    [moveMutation],
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
        <Icon name="error" size={28} className="mx-auto text-red-500" />
        <p className="mt-2 text-sm text-text-muted">Failed to load data</p>
        <button
          onClick={() => {
            inboxQuery.refetch();
            actionsQuery.refetch();
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
        inboxItems={inboxQuery.data ?? []}
        actions={actionsQuery.data ?? []}
        referenceItems={referencesQuery.data ?? []}
        projects={projectsQuery.data ?? []}
        requestedBucket={requestedBucket}
        onBucketChange={onBucketChange}
        onCaptureInbox={handleCapture}
        onTriageInbox={handleTriage}
        onAddAction={handleAddAction}
        onCompleteAction={handleComplete}
        onToggleFocus={handleToggleFocus}
        onMoveAction={handleMove}
        onAddReference={handleAddReference}
        onArchiveReference={handleArchiveReference}
        onAddProjectAction={handleAddProjectAction}
        onUpdateTitle={handleUpdateTitle}
      />
    </div>
  );
}
