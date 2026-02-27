import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import type {
  ProjectActionResponse,
  ProjectActionDetailResponse,
} from "@/lib/api-client";
import { ApiError, CollaborationApi } from "@/lib/api-client";
import {
  useAddProjectActionComment,
  useAddProjectMember,
  useCreateProjectAction,
  useProjectActionDetail,
  useProjectActionHistory,
  useProjectActions,
  useProjectMembers,
  useProjectWorkflow,
  useRemoveProjectMember,
  useTransitionProjectAction,
  useUpdateProjectAction,
} from "@/hooks/use-collaboration";
import type { CanonicalId } from "@/model/canonical-id";
import type { ActionItem, ItemEditableFields, Project } from "@/model/types";

const DEFAULT_STATUSES = [
  "PotentialActionStatus",
  "ActiveActionStatus",
  "CompletedActionStatus",
  "FailedActionStatus",
] as const;
const DEFAULT_STATUS = "PotentialActionStatus";
const DEFAULT_DONE_STATUSES = ["CompletedActionStatus"] as const;
const DEFAULT_BLOCKED_STATUSES = ["FailedActionStatus"] as const;

const DEFAULT_LABELS: Record<string, string> = {
  PotentialActionStatus: "Backlog",
  ActiveActionStatus: "In Progress",
  CompletedActionStatus: "Done",
  FailedActionStatus: "Blocked",
};

type ViewMode = "list" | "kanban";

type ProjectCollaborationWorkspaceProps = {
  project: Project;
  currentUserId?: string;
  isSharedProject?: boolean;
  legacyActions?: ActionItem[];
  onEditProject?: (
    id: CanonicalId,
    fields: Partial<ItemEditableFields>,
  ) => void | Promise<void>;
};

function parseApiErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : null;
  }
  const detail = error.details as
    | { detail?: string | { message?: string } }
    | undefined;
  if (typeof detail?.detail === "string") return detail.detail;
  if (
    detail?.detail &&
    typeof detail.detail === "object" &&
    typeof detail.detail.message === "string"
  ) {
    return detail.detail.message;
  }
  return error.message;
}

function toDateInputValue(value: string | undefined | null): string {
  if (!value) return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

function toIsoDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(`${trimmed}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;
  const now = new Date();
  const dueDate = new Date(
    due.getUTCFullYear(),
    due.getUTCMonth(),
    due.getUTCDate(),
    23,
    59,
    59,
  );
  return dueDate.getTime() < now.getTime();
}

function isToday(dueAt: string | null): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;
  const now = new Date();
  return (
    due.getUTCFullYear() === now.getUTCFullYear() &&
    due.getUTCMonth() === now.getUTCMonth() &&
    due.getUTCDate() === now.getUTCDate()
  );
}

function toIsoDateFromLegacy(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T12:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function selectLegacyStatus(
  action: ActionItem,
  statuses: readonly string[],
  defaultStatus: string,
  doneStatuses: readonly string[],
  blockedStatuses: readonly string[],
): string {
  const allowed = new Set(statuses);
  const firstStatus = statuses[0] ?? DEFAULT_STATUS;
  const fallback = allowed.has(defaultStatus) ? defaultStatus : firstStatus;
  const doneStatus =
    doneStatuses.find((status) => allowed.has(status)) ??
    (allowed.has("CompletedActionStatus") ? "CompletedActionStatus" : fallback);
  const blockedStatus =
    blockedStatuses.find((status) => allowed.has(status)) ??
    (allowed.has("FailedActionStatus") ? "FailedActionStatus" : fallback);
  const activeStatus = allowed.has("ActiveActionStatus")
    ? "ActiveActionStatus"
    : fallback;

  if (action.completedAt) return doneStatus;
  if (action.bucket === "someday") return fallback;
  if (action.bucket === "waiting") return blockedStatus;
  return activeStatus;
}

type ActionCardProps = {
  action: ProjectActionResponse;
  statuses: readonly string[];
  statusLabels: Record<string, string>;
  onOpenDetail: (actionId: string) => void;
  onRename: (actionId: string, name: string) => void;
  onUpdateDueDate: (actionId: string, dueDate: string) => void;
  onUpdateAssignee: (actionId: string, assigneeText: string) => void;
  onUpdateTags: (actionId: string, tags: string[]) => void;
  onMoveStatus: (actionId: string, toStatus: string) => void;
  onMoveHorizontal: (actionId: string, direction: -1 | 1) => void;
  compact?: boolean;
};

function ActionCard({
  action,
  statuses,
  statusLabels,
  onOpenDetail,
  onRename,
  onUpdateDueDate,
  onUpdateAssignee,
  onUpdateTags,
  onMoveStatus,
  onMoveHorizontal,
  compact = false,
}: ActionCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: action.id,
      data: {
        actionId: action.id,
        status: action.action_status,
      },
    });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const overdue = isOverdue(action.due_at);
  const dueToday = isToday(action.due_at);
  const statusIndex = statuses.indexOf(action.action_status);
  const canMoveLeft = statusIndex > 0;
  const canMoveRight = statusIndex >= 0 && statusIndex < statuses.length - 1;

  return (
    <article
      ref={setNodeRef}
      style={style}
      role="article"
      aria-roledescription="kanban card"
      onDoubleClick={() => onOpenDetail(action.id)}
      className={cn(
        "space-y-2 rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-sm",
        compact && "space-y-1.5 p-2.5",
        isDragging && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <input
          aria-label="Action title"
          defaultValue={action.name}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim();
            if (next && next !== action.name) onRename(action.id, next);
          }}
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-text outline-none hover:border-border focus:border-blueprint-400"
        />
        <button
          type="button"
          aria-label="Drag action card"
          {...attributes}
          {...listeners}
          className="shrink-0 rounded-[var(--radius-sm)] p-1 text-text-subtle hover:bg-paper-100"
        >
          <Icon name="drag_indicator" size={14} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
          <Icon name="chat_bubble_outline" size={12} />
          {action.comment_count}
        </span>
        {action.due_at && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5",
              overdue
                ? "bg-status-error/10 text-status-error"
                : dueToday
                  ? "bg-status-warning/10 text-status-warning"
                  : "bg-paper-100 text-text-muted",
            )}
          >
            {overdue ? "Overdue" : dueToday ? "Due today" : "Scheduled"}
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span className="shrink-0">Assignee</span>
          <input
            aria-label="Assignee"
            defaultValue={action.owner_text ?? action.owner_user_id ?? ""}
            onBlur={(event) =>
              onUpdateAssignee(action.id, event.currentTarget.value.trim())
            }
            className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span className="shrink-0">Due</span>
          <input
            aria-label="Due date"
            type="date"
            defaultValue={toDateInputValue(action.due_at)}
            onChange={(event) => onUpdateDueDate(action.id, event.currentTarget.value)}
            className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-text-muted">
        <span className="shrink-0">Tags</span>
        <input
          aria-label="Tags"
          defaultValue={action.tags.join(", ")}
          onBlur={(event) => {
            const next = event.currentTarget.value
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean);
            onUpdateTags(action.id, next);
          }}
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
        />
      </label>

      <div className="flex items-center justify-between gap-2">
        <select
          aria-label="Action status"
          value={action.action_status}
          onChange={(event) => onMoveStatus(action.id, event.currentTarget.value)}
          className="min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status] ?? status}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Move card left"
            disabled={!canMoveLeft}
            onClick={() => onMoveHorizontal(action.id, -1)}
            className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs disabled:opacity-40"
          >
            <Icon name="arrow_back" size={12} />
          </button>
          <button
            type="button"
            aria-label="Move card right"
            disabled={!canMoveRight}
            onClick={() => onMoveHorizontal(action.id, 1)}
            className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs disabled:opacity-40"
          >
            <Icon name="arrow_forward" size={12} />
          </button>
        </div>
      </div>
    </article>
  );
}

type BoardColumnProps = {
  status: string;
  label: string;
  children: React.ReactNode;
  quickAddValue: string;
  onQuickAddChange: (value: string) => void;
  onQuickAddSubmit: () => void;
};

function BoardColumn({
  status,
  label,
  children,
  quickAddValue,
  onQuickAddChange,
  onQuickAddSubmit,
}: BoardColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: status,
    data: { status },
  });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "min-h-[16rem] rounded-[var(--radius-lg)] border border-border bg-paper-50 p-3",
        isOver && "border-blueprint-400 bg-blueprint-50/40",
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-text">{label}</h4>
      </header>
      <div className="space-y-2">{children}</div>
      <div className="mt-3 flex items-center gap-2">
        <input
          aria-label={`Add action in ${label}`}
          value={quickAddValue}
          onChange={(event) => onQuickAddChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onQuickAddSubmit();
            }
          }}
          placeholder="Add action..."
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={onQuickAddSubmit}
          className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs"
        >
          Add
        </button>
      </div>
    </section>
  );
}

function flattenTimeline(history: {
  transitions: Array<{ id: number; ts: string; from_status: string | null; to_status: string }>;
  revisions: Array<{ id: number; created_at: string; diff: Record<string, unknown> }>;
}) {
  const transitions = history.transitions.map((entry) => ({
    key: `transition-${entry.id}`,
    ts: entry.ts,
    label: entry.from_status
      ? `Status: ${entry.from_status} -> ${entry.to_status}`
      : `Status set to ${entry.to_status}`,
  }));
  const revisions = history.revisions.map((entry) => ({
    key: `revision-${entry.id}`,
    ts: entry.created_at,
    label: `Edited fields: ${Object.keys(entry.diff).join(", ") || "metadata"}`,
  }));
  return [...transitions, ...revisions].sort((a, b) =>
    a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0,
  );
}

type CommentNode = ProjectActionDetailResponse["comments"][number];

function buildCommentChildren(
  comments: ProjectActionDetailResponse["comments"],
): Map<string, CommentNode[]> {
  const byParent = new Map<string, CommentNode[]>();
  for (const comment of comments) {
    const key = comment.parent_comment_id ?? "root";
    const existing = byParent.get(key) ?? [];
    existing.push(comment);
    byParent.set(key, existing);
  }
  return byParent;
}

export function ProjectCollaborationWorkspace({
  project,
  currentUserId,
  isSharedProject = false,
  legacyActions = [],
  onEditProject,
}: ProjectCollaborationWorkspaceProps) {
  const storageKey = `collaboration-view:${project.id}`;
  const initialViewMode = (() => {
    if (typeof window === "undefined") return "list" as ViewMode;
    const params = new URLSearchParams(window.location.search);
    if (params.get("project") === project.id) {
      const view = params.get("view");
      if (view === "list" || view === "kanban") return view;
    }
    const stored = window.localStorage.getItem(storageKey);
    return stored === "kanban" ? "kanban" : "list";
  })();

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [showSettings, setShowSettings] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [tagFilter, setTagFilter] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("project") === project.id ? (params.get("tag") ?? "") : "";
  });
  const [quickAddByStatus, setQuickAddByStatus] = useState<Record<string, string>>(
    {},
  );
  const [activeActionId, setActiveActionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get("project") !== project.id) return null;
    return params.get("action");
  });
  const [descriptionDraftByAction, setDescriptionDraftByAction] = useState<
    Record<string, string>
  >({});
  const [objectRefDraftByAction, setObjectRefDraftByAction] = useState<
    Record<string, string>
  >({});
  const [commentDraft, setCommentDraft] = useState("");
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [projectDueDateDraftByProject, setProjectDueDateDraftByProject] =
    useState<Record<string, string>>({});
  const [dragActionId, setDragActionId] = useState<string | null>(null);
  const [legacySyncState, setLegacySyncState] = useState<
    "idle" | "syncing" | "done"
  >("idle");
  const [legacySyncError, setLegacySyncError] = useState<string | null>(null);

  const workflowQuery = useProjectWorkflow(project.id);
  const actionsQuery = useProjectActions(project.id);
  const membersQuery = useProjectMembers(project.id);
  const detailQuery = useProjectActionDetail(project.id, activeActionId, Boolean(activeActionId));
  const historyQuery = useProjectActionHistory(
    project.id,
    activeActionId,
    Boolean(activeActionId),
  );

  const addMemberMutation = useAddProjectMember(project.id);
  const removeMemberMutation = useRemoveProjectMember(project.id);
  const createActionMutation = useCreateProjectAction(project.id);
  const updateActionMutation = useUpdateProjectAction(project.id);
  const transitionActionMutation = useTransitionProjectAction(project.id);
  const addCommentMutation = useAddProjectActionComment(project.id);
  const normalizedLegacyActions = useMemo(
    () => legacyActions.filter((action) => action.bucket !== "inbox"),
    [legacyActions],
  );

  const statuses: string[] = workflowQuery.data?.canonical_statuses
    ? [...workflowQuery.data.canonical_statuses]
    : [...DEFAULT_STATUSES];
  const statusLabels = workflowQuery.data?.column_labels ?? DEFAULT_LABELS;
  const actions = actionsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const activeAction = detailQuery.data;
  const history = historyQuery.data;
  const activeDragAction = dragActionId
    ? actions.find((action) => action.id === dragActionId) ?? null
    : null;

  const currentMember = currentUserId
    ? members.find((member) => member.user_id === currentUserId)
    : null;
  const canManageMembers = Boolean(currentMember?.is_owner);
  const isShared = isSharedProject || members.length > 1;
  const activeObjectRef =
    activeAction && activeAction.object_ref && typeof activeAction.object_ref["@id"] === "string"
      ? (activeAction.object_ref["@id"] as string)
      : "";
  const descriptionDraft = activeAction
    ? (descriptionDraftByAction[activeAction.id] ?? activeAction.description ?? "")
    : "";
  const objectRefDraft = activeAction
    ? (objectRefDraftByAction[activeAction.id] ?? activeObjectRef)
    : "";
  const projectDueDateDraft =
    projectDueDateDraftByProject[project.id] ?? toDateInputValue(project.dueDate);

  const normalizedTagFilter = tagFilter.trim().toLowerCase();
  const filteredActions = !normalizedTagFilter
    ? actions
    : actions.filter((action) =>
        action.tags.some((tag) => tag.toLowerCase().includes(normalizedTagFilter)),
      );

  const actionsByStatus: Record<string, ProjectActionResponse[]> = {};
  for (const status of statuses) actionsByStatus[status] = [];
  for (const action of filteredActions) {
    const status = action.action_status;
    if (!actionsByStatus[status]) actionsByStatus[status] = [];
    actionsByStatus[status].push(action);
  }

  const tagSet = new Set<string>();
  for (const action of actions) {
    for (const tag of action.tags) tagSet.add(tag);
  }
  const sortedTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    setLegacySyncState("idle");
    setLegacySyncError(null);
  }, [project.id]);

  useEffect(() => {
    if (legacySyncState !== "idle") return;
    if (workflowQuery.isLoading || actionsQuery.isLoading) return;
    if (actions.length > 0 || normalizedLegacyActions.length === 0) {
      setLegacySyncState("done");
      return;
    }

    let cancelled = false;
    setLegacySyncState("syncing");
    setLegacySyncError(null);

    void (async () => {
      try {
        const defaultStatus = workflowQuery.data?.default_status ?? DEFAULT_STATUS;
        const doneStatuses = workflowQuery.data?.done_statuses ?? DEFAULT_DONE_STATUSES;
        const blockedStatuses =
          workflowQuery.data?.blocked_statuses ?? DEFAULT_BLOCKED_STATUSES;

        for (const legacyAction of normalizedLegacyActions) {
          const title = (legacyAction.name ?? legacyAction.rawCapture ?? "").trim();
          if (!title) continue;

          const dueAt = toIsoDateFromLegacy(
            legacyAction.dueDate ??
              legacyAction.scheduledDate ??
              legacyAction.startDate,
          );
          const actionStatus = selectLegacyStatus(
            legacyAction,
            statuses,
            defaultStatus,
            doneStatuses,
            blockedStatuses,
          );

          try {
            await CollaborationApi.createProjectAction(project.id, {
              canonical_id: legacyAction.id,
              name: title,
              description: legacyAction.description ?? undefined,
              action_status: actionStatus,
              owner_text: legacyAction.delegatedTo,
              due_at: dueAt,
              tags: legacyAction.tags,
            });
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              continue;
            }
            throw error;
          }
        }

        if (cancelled) return;
        await actionsQuery.refetch?.();
        if (!cancelled) setLegacySyncState("done");
      } catch (error) {
        if (cancelled) return;
        setLegacySyncError(
          parseApiErrorMessage(error) ?? "Failed to sync existing project actions",
        );
        setLegacySyncState("done");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    actions.length,
    actionsQuery.isLoading,
    legacySyncState,
    normalizedLegacyActions,
    project.id,
    statuses,
    workflowQuery.data?.blocked_statuses,
    workflowQuery.data?.default_status,
    workflowQuery.data?.done_statuses,
    workflowQuery.isLoading,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, viewMode);
  }, [storageKey, viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("project", project.id);
    params.set("view", viewMode);
    if (tagFilter.trim()) {
      params.set("tag", tagFilter.trim());
    } else {
      params.delete("tag");
    }
    if (activeActionId) {
      params.set("action", activeActionId);
    } else {
      params.delete("action");
    }
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [activeActionId, project.id, tagFilter, viewMode]);

  const moveActionToStatus = (actionId: string, toStatus: string) => {
    const action = actions.find((row) => row.id === actionId);
    if (!action || action.action_status === toStatus) return;
    transitionActionMutation.mutate({
      actionId,
      payload: {
        to_status: toStatus,
        expected_last_event_id: action.last_event_id ?? undefined,
        correlation_id: crypto.randomUUID(),
      },
    });
  };

  const handleMoveHorizontal = (actionId: string, direction: -1 | 1) => {
    const action = actions.find((row) => row.id === actionId);
    if (!action) return;
    const currentIndex = statuses.indexOf(action.action_status);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= statuses.length) return;
    const toStatus = statuses[nextIndex];
    if (!toStatus) return;
    moveActionToStatus(actionId, toStatus);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setDragActionId(id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragActionId(null);
    if (!event.over) return;
    const actionId = String(event.active.id);
    const toStatus = String(event.over.id);
    moveActionToStatus(actionId, toStatus);
  };

  const renderCard = (action: ProjectActionResponse, compact = false) => (
    <ActionCard
      key={action.id}
      action={action}
      statuses={statuses}
      statusLabels={statusLabels}
      compact={compact}
      onOpenDetail={setActiveActionId}
      onRename={(actionId, name) => {
        updateActionMutation.mutate({
          actionId,
          payload: { name },
        });
      }}
      onUpdateDueDate={(actionId, dueDateValue) => {
        updateActionMutation.mutate({
          actionId,
          payload: { due_at: toIsoDate(dueDateValue) },
        });
      }}
      onUpdateAssignee={(actionId, assigneeText) => {
        updateActionMutation.mutate({
          actionId,
          payload: { owner_text: assigneeText || null },
        });
      }}
      onUpdateTags={(actionId, tags) => {
        updateActionMutation.mutate({
          actionId,
          payload: { tags },
        });
      }}
      onMoveStatus={moveActionToStatus}
      onMoveHorizontal={handleMoveHorizontal}
    />
  );

  const settingsError =
    parseApiErrorMessage(addMemberMutation.error) ??
    parseApiErrorMessage(removeMemberMutation.error);
  const actionsError =
    parseApiErrorMessage(actionsQuery.error) ??
    parseApiErrorMessage(createActionMutation.error) ??
    parseApiErrorMessage(updateActionMutation.error) ??
    parseApiErrorMessage(transitionActionMutation.error) ??
    parseApiErrorMessage(addCommentMutation.error) ??
    legacySyncError;

  const timeline = history ? flattenTimeline(history) : [];
  const commentChildren = activeAction
    ? buildCommentChildren(activeAction.comments)
    : new Map<string, CommentNode[]>();

  const renderCommentBranch = (parentId: string, depth: number): React.ReactNode =>
    (commentChildren.get(parentId) ?? []).map((comment) => (
      <div
        key={comment.id}
        className={cn(
          "space-y-1 rounded-[var(--radius-sm)] border border-border bg-paper-50 p-2",
          depth > 0 && "ml-4",
        )}
      >
        <p className="text-xs text-text-muted">
          {new Date(comment.created_at).toLocaleString()}
        </p>
        <p className="text-sm text-text">{comment.body}</p>
        <button
          type="button"
          onClick={() => setReplyParentId(comment.id)}
          className="text-xs text-blueprint-600 hover:underline"
        >
          Reply
        </button>
        {renderCommentBranch(comment.id, depth + 1)}
      </div>
    ));

  return (
    <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface-raised p-3">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowSettings((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-transparent px-1 py-0.5 text-left text-base font-semibold text-text hover:border-border"
          >
            <span>{project.name ?? "Untitled project"}</span>
            <Icon name={showSettings ? "expand_less" : "expand_more"} size={16} />
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {isShared && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blueprint-50 px-2 py-0.5 text-xs text-blueprint-700">
                <Icon name="groups" size={12} />
                Shared
              </span>
            )}
            <div className="inline-flex items-center rounded-[var(--radius-md)] border border-border bg-paper-50 p-0.5">
              <button
                type="button"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={cn(
                  "rounded-[var(--radius-sm)] px-2 py-1 text-xs",
                  viewMode === "list"
                    ? "bg-surface text-text shadow-sm"
                    : "text-text-muted",
                )}
              >
                List
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "kanban"}
                onClick={() => setViewMode("kanban")}
                className={cn(
                  "rounded-[var(--radius-sm)] px-2 py-1 text-xs",
                  viewMode === "kanban"
                    ? "bg-surface text-text shadow-sm"
                    : "text-text-muted",
                )}
              >
                Kanban
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <span>Tag filter</span>
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.currentTarget.value)}
              placeholder="Filter tags"
              className="rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
            />
          </label>
          {sortedTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tag)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs",
                tagFilter === tag
                  ? "border-blueprint-500 bg-blueprint-50 text-blueprint-700"
                  : "border-border text-text-muted",
              )}
            >
              {tag}
            </button>
          ))}
          {tagFilter && (
            <button
              type="button"
              onClick={() => setTagFilter("")}
              className="text-xs text-text-muted underline"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {showSettings && (
        <section className="space-y-3 rounded-[var(--radius-md)] border border-border bg-paper-50 p-3">
          <h4 className="text-sm font-semibold text-text">Project settings</h4>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <span>Project due date</span>
              <input
                type="date"
                value={projectDueDateDraft}
                onChange={(event) =>
                  setProjectDueDateDraftByProject((prev) => ({
                    ...prev,
                    [project.id]: event.currentTarget.value,
                  }))
                }
                className="rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                if (!onEditProject) return;
                onEditProject(project.id, {
                  dueDate: projectDueDateDraft || undefined,
                });
              }}
              disabled={!onEditProject}
              className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs disabled:opacity-40"
            >
              Save due date
            </button>
          </div>

          <div className="space-y-2">
            <h5 className="text-xs font-semibold text-text">Collaborators</h5>
            <ul className="space-y-1 text-xs text-text-muted">
              {members.map((member) => (
                <li
                  key={member.user_id}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1"
                >
                  <span>
                    {member.email}
                    {member.is_owner ? " (owner)" : ""}
                  </span>
                  {!member.is_owner && (
                    <button
                      type="button"
                      onClick={() => removeMemberMutation.mutate(member.user_id)}
                      disabled={!canManageMembers}
                      className="text-status-error disabled:opacity-40"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.currentTarget.value)}
                placeholder="teammate@example.com"
                disabled={!canManageMembers}
                className="min-w-[14rem] rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs disabled:opacity-40"
              />
              <button
                type="button"
                disabled={!canManageMembers || !inviteEmail.trim()}
                onClick={() => {
                  addMemberMutation.mutate(
                    { email: inviteEmail.trim(), role: "member" },
                    {
                      onSuccess: () => setInviteEmail(""),
                    },
                  );
                }}
                className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs disabled:opacity-40"
              >
                Add member
              </button>
            </div>
            <p className="text-[11px] text-text-muted">
              {canManageMembers
                ? "You are owner: collaborator changes are enabled."
                : "You are member: collaborator changes are view-only."}
            </p>
          </div>
        </section>
      )}

      {settingsError && (
        <p className="rounded-[var(--radius-sm)] bg-status-error/10 px-2 py-1 text-xs text-status-error">
          {settingsError}
        </p>
      )}

      {actionsError && (
        <p className="rounded-[var(--radius-sm)] bg-status-error/10 px-2 py-1 text-xs text-status-error">
          {actionsError}
        </p>
      )}

      {workflowQuery.isLoading ||
      actionsQuery.isLoading ||
      legacySyncState === "syncing" ? (
        <p className="text-sm text-text-muted">
          {legacySyncState === "syncing"
            ? "Syncing existing project actions..."
            : "Loading collaboration workspace..."}
        </p>
      ) : viewMode === "list" ? (
        filteredActions.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium text-text">No action cards yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Create a card in Kanban view to start collaboration.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredActions.map((action) => renderCard(action, true))}
          </div>
        )
      ) : (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid gap-3 xl:grid-cols-4">
            {statuses.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                label={statusLabels[status] ?? status}
                quickAddValue={quickAddByStatus[status] ?? ""}
                onQuickAddChange={(value) =>
                  setQuickAddByStatus((prev) => ({ ...prev, [status]: value }))
                }
                onQuickAddSubmit={() => {
                  const title = (quickAddByStatus[status] ?? "").trim();
                  if (!title) return;
                  createActionMutation.mutate(
                    { name: title, action_status: status },
                    {
                      onSuccess: () =>
                        setQuickAddByStatus((prev) => ({ ...prev, [status]: "" })),
                    },
                  );
                }}
              >
                {(actionsByStatus[status] ?? []).map((action) => renderCard(action))}
              </BoardColumn>
            ))}
          </div>
          <DragOverlay>
            {activeDragAction ? renderCard(activeDragAction) : null}
          </DragOverlay>
        </DndContext>
      )}

      {activeActionId && (
        <aside className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-text">Action detail</h4>
            <button
              type="button"
              onClick={() => setActiveActionId(null)}
              className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs"
            >
              Close
            </button>
          </div>

          {activeAction ? (
            <>
              <label className="block space-y-1 text-xs text-text-muted">
                <span>Description (markdown)</span>
                <textarea
                  value={descriptionDraft}
                  onChange={(event) =>
                    setDescriptionDraftByAction((prev) => ({
                      ...prev,
                      [activeAction.id]: event.currentTarget.value,
                    }))
                  }
                  rows={5}
                  className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-sm text-text"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateActionMutation.mutate({
                      actionId: activeAction.id,
                      payload: { description: descriptionDraft },
                    })
                  }
                  className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs"
                >
                  Save description
                </button>
              </label>

              <div className="rounded-[var(--radius-sm)] border border-border bg-paper-50 p-2">
                <p className="mb-1 text-xs font-semibold text-text-muted">Preview</p>
                <pre className="whitespace-pre-wrap text-sm text-text">
                  {descriptionDraft || "No description"}
                </pre>
              </div>

              <label className="block space-y-1 text-xs text-text-muted">
                <span>Linked event/asset reference (@id)</span>
                <input
                  value={objectRefDraft}
                  onChange={(event) =>
                    setObjectRefDraftByAction((prev) => ({
                      ...prev,
                      [activeAction.id]: event.currentTarget.value,
                    }))
                  }
                  placeholder="urn:app:ref:..."
                  className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateActionMutation.mutate({
                      actionId: activeAction.id,
                      payload: {
                        object_ref: objectRefDraft.trim()
                          ? { "@id": objectRefDraft.trim() }
                          : null,
                      },
                    })
                  }
                  className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs"
                >
                  Save linked context
                </button>
              </label>

              <section className="space-y-2">
                <h5 className="text-xs font-semibold text-text">
                  Comments ({activeAction.comments.length})
                </h5>
                {activeAction.comments.length === 0 ? (
                  <p className="text-xs text-text-muted">
                    No comments yet. Add context for collaborators.
                  </p>
                ) : (
                  <div className="space-y-2">{renderCommentBranch("root", 0)}</div>
                )}
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.currentTarget.value)}
                  rows={2}
                  placeholder={
                    replyParentId
                      ? "Write a reply..."
                      : "Add a comment for collaborators..."
                  }
                  className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-sm"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!commentDraft.trim()) return;
                      addCommentMutation.mutate(
                        {
                          actionId: activeAction.id,
                          payload: {
                            body: commentDraft.trim(),
                            parent_comment_id: replyParentId ?? undefined,
                          },
                        },
                        {
                          onSuccess: () => {
                            setCommentDraft("");
                            setReplyParentId(null);
                          },
                        },
                      );
                    }}
                    className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs"
                  >
                    {replyParentId ? "Reply" : "Add comment"}
                  </button>
                  {replyParentId && (
                    <button
                      type="button"
                      onClick={() => setReplyParentId(null)}
                      className="text-xs text-text-muted underline"
                    >
                      Cancel reply
                    </button>
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <h5 className="text-xs font-semibold text-text">Timeline</h5>
                {timeline.length === 0 ? (
                  <p className="text-xs text-text-muted">
                    No revisions or transitions yet.
                  </p>
                ) : (
                  <ol className="space-y-1 text-xs text-text-muted">
                    {timeline.map((entry) => (
                      <li
                        key={entry.key}
                        className="rounded-[var(--radius-sm)] border border-border bg-paper-50 px-2 py-1"
                      >
                        <p className="text-text">{entry.label}</p>
                        <p>{new Date(entry.ts).toLocaleString()}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          ) : (
            <p className="text-xs text-text-muted">Loading action detail...</p>
          )}
        </aside>
      )}
    </section>
  );
}
