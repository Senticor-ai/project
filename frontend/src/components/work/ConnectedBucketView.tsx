import {
  useCallback,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { BucketView } from "./BucketView";
import { useAllItems, useProjects, useReferences } from "@/hooks/use-items";
import { useOrganizations } from "@/hooks/use-organizations";
import {
  useCalendarEvents,
  useDeleteCalendarEvent,
  usePatchCalendarEvent,
  useSetCalendarEventRsvp,
} from "@/hooks/use-calendar-events";
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
import {
  CollaborationApi,
} from "@/lib/api-client";
import { buildItemEditPatch } from "@/lib/item-serializer";
import type {
  ActionItemBucket,
  ItemEditableFields,
  Project,
} from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";
import { cn } from "@/lib/utils";
import { ProjectCollaborationWorkspace } from "./ProjectCollaborationWorkspace";

import type { Bucket } from "@/model/types";

type BackgroundUpload = {
  id: string;
  fileName: string;
  status: "uploading" | "failed";
};

export interface ConnectedBucketViewProps {
  activeBucket: Bucket;
  onBucketChange: (bucket: Bucket) => void;
  currentUserId?: string;
  sidebarControls?: ReactNode;
  className?: string;
}

export function ConnectedBucketView({
  activeBucket,
  onBucketChange,
  currentUserId,
  sidebarControls,
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
  const calendarEventsQuery = useCalendarEvents(activeBucket === "calendar");
  const patchCalendarEvent = usePatchCalendarEvent();
  const rsvpCalendarEvent = useSetCalendarEventRsvp();
  const deleteCalendarEvent = useDeleteCalendarEvent();

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

  const [backgroundUploads, setBackgroundUploads] = useState<
    BackgroundUpload[]
  >([]);
  const [uploadNoticeMinimized, setUploadNoticeMinimized] = useState(false);

  const activeBackgroundUploads = useMemo(
    () => backgroundUploads.filter((upload) => upload.status === "uploading"),
    [backgroundUploads],
  );
  const failedBackgroundUploads = useMemo(
    () => backgroundUploads.filter((upload) => upload.status === "failed"),
    [backgroundUploads],
  );
  const activeUploadCount = activeBackgroundUploads.length;
  const failedUploadCount = failedBackgroundUploads.length;
  const showUploadNotice = activeUploadCount > 0 || failedUploadCount > 0;

  const markUploadFailed = useCallback((uploadId: string) => {
    setBackgroundUploads((current) =>
      current.map((upload) =>
        upload.id === uploadId ? { ...upload, status: "failed" } : upload,
      ),
    );
  }, []);

  const clearUpload = useCallback((uploadId: string) => {
    setBackgroundUploads((current) =>
      current.filter((upload) => upload.id !== uploadId),
    );
  }, []);

  const clearFailedUploads = useCallback(() => {
    setBackgroundUploads((current) =>
      current.filter((upload) => upload.status !== "failed"),
    );
  }, []);

  const error =
    actionItemsQuery.error ?? projectsQuery.error ?? referencesQuery.error;

  const [sharedProjectIds, setSharedProjectIds] = useState<CanonicalId[]>([]);
  useEffect(() => {
    if (activeBucket !== "project") return;
    let canceled = false;
    const projects = projectsQuery.data ?? [];

    void (async () => {
      if (projects.length === 0) {
        if (!canceled) setSharedProjectIds([]);
        return;
      }
      const memberships = await Promise.allSettled(
        projects.map((project) => CollaborationApi.listProjectMembers(project.id)),
      );
      if (canceled) return;
      const shared = memberships
        .map((result, index) => {
          const project = projects[index];
          if (!project) return null;
          return result.status === "fulfilled" && result.value.length > 1
            ? project.id
            : null;
        })
        .filter((id): id is CanonicalId => Boolean(id));
      setSharedProjectIds(shared);
    })();

    return () => {
      canceled = true;
    };
  }, [activeBucket, projectsQuery.data]);

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
    (id: CanonicalId, newTitle: string, nameSource?: string) =>
      updateItemMutation.mutate({
        canonicalId: id,
        patch: { name: newTitle },
        ...(nameSource ? { nameSource } : {}),
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

  const handleSetType = useCallback(
    (id: CanonicalId, type: string) =>
      updateItemMutation.mutate({
        canonicalId: id,
        patch: { "@type": type },
      }),
    [updateItemMutation],
  );

  const handleArchiveProject = useCallback(
    (id: CanonicalId) =>
      updateItemMutation.mutate({
        canonicalId: id,
        patch: {
          additionalProperty: [
            {
              "@type": "PropertyValue",
              propertyID: "app:projectStatus",
              value: "archived",
            },
            {
              "@type": "PropertyValue",
              propertyID: "app:isFocused",
              value: false,
            },
          ],
        },
      }),
    [updateItemMutation],
  );

  const handleFileDrop = useCallback(
    (files: File[]) => {
      setUploadNoticeMinimized(false);
      for (const file of files) {
        const uploadId =
          "upload-" + Date.now().toString(36) + "-" + crypto.randomUUID();
        setBackgroundUploads((current) => [
          ...current,
          { id: uploadId, fileName: file.name, status: "uploading" },
        ]);
        void captureFileMutation
          .mutateAsync(file, {
            onUploadSuccess: () => clearUpload(uploadId),
            onUploadError: () => markUploadFailed(uploadId),
          })
          .catch(() => markUploadFailed(uploadId));
      }
    },
    [captureFileMutation, clearUpload, markUploadFailed],
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

  const renderProjectWorkspace = useCallback(
    (project: Project) => (
      <ProjectCollaborationWorkspace
        project={project}
        currentUserId={currentUserId}
        isSharedProject={sharedProjectIds.includes(project.id)}
        onEditProject={handleEditItem}
      />
    ),
    [currentUserId, handleEditItem, sharedProjectIds],
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
      {showUploadNotice && (
        <div className="absolute top-2 right-2 z-20 w-[min(24rem,calc(100%-1rem))]">
          {uploadNoticeMinimized ? (
            <button
              type="button"
              onClick={() => setUploadNoticeMinimized(false)}
              aria-label="Show upload status"
              className="ml-auto flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text shadow-[var(--shadow-sheet)]"
            >
              <Icon
                name={activeUploadCount > 0 ? "cloud_upload" : "error"}
                size={14}
                className={cn(activeUploadCount > 0 && "animate-pulse")}
              />
              {activeUploadCount > 0
                ? `Uploading ${activeUploadCount} file${activeUploadCount === 1 ? "" : "s"}`
                : `${failedUploadCount} upload${failedUploadCount === 1 ? "" : "s"} failed`}
              <Icon name="expand_less" size={14} />
            </button>
          ) : (
            <section
              role="status"
              aria-live="polite"
              aria-label="Background uploads"
              className="rounded-[var(--radius-md)] border border-border bg-surface-raised p-3 shadow-[var(--shadow-sheet)]"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon
                    name={activeUploadCount > 0 ? "cloud_upload" : "error"}
                    size={16}
                    className={cn(
                      activeUploadCount > 0
                        ? "animate-spin text-blueprint-600"
                        : "text-status-error",
                    )}
                  />
                  <span className="text-sm font-medium text-text-primary">
                    {activeUploadCount > 0
                      ? `Uploading ${activeUploadCount} file${activeUploadCount === 1 ? "" : "s"} in background`
                      : `${failedUploadCount} upload${failedUploadCount === 1 ? "" : "s"} failed`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadNoticeMinimized(true)}
                  aria-label="Minimize upload status"
                  className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-text-subtle hover:bg-paper-100 hover:text-text"
                >
                  <Icon name="expand_more" size={14} />
                </button>
              </div>

              {activeUploadCount > 0 && (
                <div className="space-y-1 text-xs text-text-muted">
                  {activeBackgroundUploads.slice(0, 3).map((upload) => (
                    <p key={upload.id} className="truncate">
                      {upload.fileName}
                    </p>
                  ))}
                  {activeUploadCount > 3 && (
                    <p>+{activeUploadCount - 3} more files</p>
                  )}
                </div>
              )}

              {failedUploadCount > 0 && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-status-error">
                    Some files were captured, but upload failed.
                  </p>
                  <button
                    type="button"
                    onClick={clearFailedUploads}
                    className="shrink-0 rounded-[var(--radius-sm)] border border-border px-2 py-0.5 text-xs text-text-subtle hover:bg-paper-100"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
      <BucketView
        actionItems={actionItemsQuery.data ?? []}
        referenceItems={referencesQuery.data ?? []}
        projects={projectsQuery.data ?? []}
        calendarEvents={calendarEventsQuery.data ?? []}
        calendarLoading={
          activeBucket === "calendar" &&
          (calendarEventsQuery.isLoading || calendarEventsQuery.isFetching)
        }
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
        onArchiveProject={handleArchiveProject}
        onCreateProject={handleCreateProject}
        onEditReference={handleEditItem}
        onEditProject={handleEditItem}
        sharedProjectIds={sharedProjectIds}
        renderProjectWorkspace={renderProjectWorkspace}
        onSetType={handleSetType}
        onFileDrop={handleFileDrop}
        onNavigateToReference={handleNavigateToReference}
        onPatchCalendarEvent={(canonicalId, payload) =>
          patchCalendarEvent
            .mutateAsync({ canonicalId, payload })
            .then(() => undefined)
        }
        onRsvpCalendarEvent={(canonicalId, payload) =>
          rsvpCalendarEvent
            .mutateAsync({ canonicalId, payload })
            .then(() => undefined)
        }
        onDeleteCalendarEvent={(canonicalId) =>
          deleteCalendarEvent.mutateAsync(canonicalId).then(() => undefined)
        }
        linkedActionBuckets={linkedActionBuckets}
        organizations={orgsQuery.data}
        sidebarControls={sidebarControls}
      />
    </div>
  );
}
