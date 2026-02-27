import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAction, createProject } from "@/model/factories";
import type {
  ProjectActionDetailResponse,
  ProjectActionHistoryResponse,
  ProjectActionResponse,
  ProjectMemberResponse,
  WorkflowDefinitionResponse,
} from "@/lib/api-client";
import { CollaborationApi } from "@/lib/api-client";
import { ProjectCollaborationWorkspace } from "./ProjectCollaborationWorkspace";

type QueryResult<T> = {
  data: T;
  isLoading: boolean;
  error: Error | null;
};

function loadedQuery<T>(data: T): QueryResult<T> {
  return {
    data,
    isLoading: false,
    error: null,
  };
}

const project = createProject({
  id: "urn:app:project:kanban-test",
  name: "Kanban Project",
  desiredOutcome: "Ship MVP",
});

let actionsData: ProjectActionResponse[] = [];
let membersData: ProjectMemberResponse[] = [];
let workflowData: WorkflowDefinitionResponse;
const detailByActionId = new Map<string, ProjectActionDetailResponse>();
const historyByActionId = new Map<string, ProjectActionHistoryResponse>();

const mockUseProjectWorkflow = vi.fn();
const mockUseProjectActions = vi.fn();
const mockUseProjectMembers = vi.fn();
const mockUseProjectActionDetail = vi.fn();
const mockUseProjectActionHistory = vi.fn();

const mockAddMemberMutate = vi.fn();
const mockRemoveMemberMutate = vi.fn();
const mockCreateActionMutate = vi.fn();
const mockUpdateActionMutate = vi.fn();
const mockTransitionActionMutate = vi.fn();
const mockAddCommentMutate = vi.fn();

const storageMap = new Map<string, string>();
const storageMock: Storage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value));
  },
  removeItem: (key: string) => {
    storageMap.delete(key);
  },
  clear: () => {
    storageMap.clear();
  },
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
  get length() {
    return storageMap.size;
  },
};

vi.mock("@/hooks/use-collaboration", () => ({
  useProjectWorkflow: (...args: unknown[]) => mockUseProjectWorkflow(...args),
  useProjectActions: (...args: unknown[]) => mockUseProjectActions(...args),
  useProjectMembers: (...args: unknown[]) => mockUseProjectMembers(...args),
  useProjectActionDetail: (...args: unknown[]) =>
    mockUseProjectActionDetail(...args),
  useProjectActionHistory: (...args: unknown[]) =>
    mockUseProjectActionHistory(...args),
  useAddProjectMember: () => ({ mutate: mockAddMemberMutate, error: null }),
  useRemoveProjectMember: () => ({
    mutate: mockRemoveMemberMutate,
    error: null,
  }),
  useCreateProjectAction: () => ({ mutate: mockCreateActionMutate, error: null }),
  useUpdateProjectAction: () => ({ mutate: mockUpdateActionMutate, error: null }),
  useTransitionProjectAction: () => ({
    mutate: mockTransitionActionMutate,
    error: null,
  }),
  useAddProjectActionComment: () => ({
    mutate: mockAddCommentMutate,
    error: null,
  }),
}));

let capturedOnDragEnd: ((event: unknown) => void) | undefined;
let capturedOnDragStart: ((event: unknown) => void) | undefined;

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragEnd,
    onDragStart,
  }: {
    children: React.ReactNode;
    onDragEnd?: (event: unknown) => void;
    onDragStart?: (event: unknown) => void;
  }) => {
    capturedOnDragEnd = onDragEnd;
    capturedOnDragStart = onDragStart;
    return <>{children}</>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}));

function makeAction(
  overrides: Partial<ProjectActionResponse> = {},
): ProjectActionResponse {
  const id = overrides.id ?? "action-1";
  const now = "2026-02-26T15:00:00Z";
  return {
    id,
    canonical_id: overrides.canonical_id ?? `urn:app:action:${id}`,
    project_id: overrides.project_id ?? project.id,
    name: overrides.name ?? "Untitled action",
    description: overrides.description ?? null,
    action_status: overrides.action_status ?? "PotentialActionStatus",
    owner_user_id: overrides.owner_user_id ?? null,
    owner_text: overrides.owner_text ?? null,
    due_at: overrides.due_at ?? null,
    tags: overrides.tags ?? [],
    object_ref: overrides.object_ref ?? null,
    attributes: overrides.attributes ?? {},
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
    last_event_id: overrides.last_event_id ?? 1,
    comment_count: overrides.comment_count ?? 0,
  };
}

function makeActionDetail(
  action: ProjectActionResponse,
  overrides: Partial<ProjectActionDetailResponse> = {},
): ProjectActionDetailResponse {
  return {
    ...action,
    comments: [],
    revisions: [],
    ...overrides,
  };
}

function makeActionHistory(
  overrides: Partial<ProjectActionHistoryResponse> = {},
): ProjectActionHistoryResponse {
  return {
    transitions: [],
    revisions: [],
    ...overrides,
  };
}

function renderWorkspace() {
  return render(
    <ProjectCollaborationWorkspace project={project} currentUserId="user-owner" />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnDragEnd = undefined;
  capturedOnDragStart = undefined;

  storageMap.clear();
  Object.defineProperty(window, "localStorage", {
    value: storageMock,
    configurable: true,
  });

  actionsData = [];
  detailByActionId.clear();
  historyByActionId.clear();

  membersData = [
    {
      project_id: project.id,
      user_id: "user-owner",
      email: "owner@example.com",
      role: "owner",
      is_owner: true,
      added_at: "2026-02-26T15:00:00Z",
      added_by: null,
    },
  ];

  workflowData = {
    policy_mode: "open",
    default_status: "PotentialActionStatus",
    done_statuses: ["CompletedActionStatus"],
    blocked_statuses: ["FailedActionStatus"],
    canonical_statuses: [
      "PotentialActionStatus",
      "ActiveActionStatus",
      "CompletedActionStatus",
      "FailedActionStatus",
    ],
    column_labels: {
      PotentialActionStatus: "Backlog",
      ActiveActionStatus: "In Progress",
      CompletedActionStatus: "Done",
      FailedActionStatus: "Blocked",
    },
    transitions: [],
  };

  mockUseProjectWorkflow.mockImplementation(() => loadedQuery(workflowData));
  mockUseProjectActions.mockImplementation(() => loadedQuery(actionsData));
  mockUseProjectMembers.mockImplementation(() => loadedQuery(membersData));
  mockUseProjectActionDetail.mockImplementation(
    (_projectId: string, actionId: string | null, enabled = true) =>
      loadedQuery(
        enabled && actionId ? detailByActionId.get(actionId) : undefined,
      ),
  );
  mockUseProjectActionHistory.mockImplementation(
    (_projectId: string, actionId: string | null, enabled = true) =>
      loadedQuery(
        enabled && actionId ? historyByActionId.get(actionId) : undefined,
      ),
  );

  mockCreateActionMutate.mockImplementation(
    (
      _payload: unknown,
      opts?: {
        onSuccess?: () => void;
      },
    ) => {
      opts?.onSuccess?.();
    },
  );
  mockAddCommentMutate.mockImplementation(
    (
      _payload: unknown,
      opts?: {
        onSuccess?: () => void;
      },
    ) => {
      opts?.onSuccess?.();
    },
  );

  window.history.replaceState({}, "", "/");
});

describe("ProjectCollaborationWorkspace (kanban integration)", () => {
  it("renders kanban columns and quick-add inputs when there are no actions", () => {
    window.history.replaceState(
      {},
      "",
      `/?project=${encodeURIComponent(project.id)}&view=kanban`,
    );

    renderWorkspace();

    expect(screen.getByRole("heading", { name: "Backlog" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "In Progress" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Blocked" })).toBeInTheDocument();
    expect(screen.getByLabelText("Add action in Backlog")).toBeInTheDocument();
  });

  it("creates an action from quick-add in the target column", async () => {
    window.history.replaceState(
      {},
      "",
      `/?project=${encodeURIComponent(project.id)}&view=kanban`,
    );
    const user = userEvent.setup();

    renderWorkspace();

    const backlogInput = screen.getByLabelText(
      "Add action in Backlog",
    ) as HTMLInputElement;
    await user.type(backlogInput, "Draft release notes");
    const backlogColumn = backlogInput.closest("section");
    expect(backlogColumn).not.toBeNull();
    await user.click(within(backlogColumn!).getByRole("button", { name: "Add" }));

    expect(mockCreateActionMutate).toHaveBeenCalledWith(
      { name: "Draft release notes", action_status: "PotentialActionStatus" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    await waitFor(() => expect(backlogInput).toHaveValue(""));
  });

  it("moves a card with status selector", async () => {
    actionsData = [
      makeAction({
        id: "action-1",
        name: "Ship release",
        action_status: "PotentialActionStatus",
        last_event_id: 42,
      }),
    ];
    window.history.replaceState(
      {},
      "",
      `/?project=${encodeURIComponent(project.id)}&view=kanban`,
    );
    const user = userEvent.setup();

    renderWorkspace();

    const statusSelect = screen.getByLabelText("Action status");
    await user.selectOptions(statusSelect, "ActiveActionStatus");

    const transitionCall = mockTransitionActionMutate.mock.calls.at(-1)?.[0] as {
      actionId: string;
      payload: {
        to_status: string;
        expected_last_event_id?: number;
        correlation_id?: string;
      };
    };
    expect(transitionCall.actionId).toBe("action-1");
    expect(transitionCall.payload.to_status).toBe("ActiveActionStatus");
    expect(transitionCall.payload.expected_last_event_id).toBe(42);
    expect(typeof transitionCall.payload.correlation_id).toBe("string");
    expect(transitionCall.payload.correlation_id).toBeTruthy();
  });

  it("moves a card with horizontal controls and drag-drop", async () => {
    actionsData = [
      makeAction({
        id: "action-1",
        name: "Ship release",
        action_status: "PotentialActionStatus",
        last_event_id: 9,
      }),
    ];
    window.history.replaceState(
      {},
      "",
      `/?project=${encodeURIComponent(project.id)}&view=kanban`,
    );
    const user = userEvent.setup();

    renderWorkspace();

    const moveLeftButton = screen.getByRole("button", { name: "Move card left" });
    expect(moveLeftButton).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move card right" }));

    let transitionCall = mockTransitionActionMutate.mock.calls.at(-1)?.[0] as {
      payload: { to_status: string };
    };
    expect(transitionCall.payload.to_status).toBe("ActiveActionStatus");

    act(() => {
      capturedOnDragStart?.({ active: { id: "action-1" } });
      capturedOnDragEnd?.({
        active: { id: "action-1" },
        over: { id: "CompletedActionStatus" },
      });
    });

    transitionCall = mockTransitionActionMutate.mock.calls.at(-1)?.[0] as {
      payload: { to_status: string };
    };
    expect(transitionCall.payload.to_status).toBe("CompletedActionStatus");
  });

  it("filters cards by tag and clears the filter", async () => {
    actionsData = [
      makeAction({
        id: "action-1",
        name: "Ship release",
        tags: ["release", "urgent"],
      }),
      makeAction({
        id: "action-2",
        name: "Plan docs",
        tags: ["docs"],
      }),
    ];
    const user = userEvent.setup();

    renderWorkspace();

    expect(screen.getByDisplayValue("Ship release")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Plan docs")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Filter tags"), "urgent");
    expect(screen.getByDisplayValue("Ship release")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Plan docs")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByDisplayValue("Ship release")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Plan docs")).toBeInTheDocument();
  });

  it("syncs legacy project actions when collaboration actions are empty", async () => {
    const createSpy = vi
      .spyOn(CollaborationApi, "createProjectAction")
      .mockResolvedValue(
        makeAction({
          id: "synced-action",
          canonical_id: "urn:app:action:legacy-1",
          name: "Legacy task",
          action_status: "ActiveActionStatus",
          due_at: "2026-03-01T12:00:00.000Z",
          tags: ["urgent"],
        }),
      );
    const legacyAction = createAction({
      id: "urn:app:action:legacy-1",
      name: "Legacy task",
      bucket: "next",
      projectId: project.id,
      dueDate: "2026-03-01",
      tags: ["urgent"],
    });

    render(
      <ProjectCollaborationWorkspace
        project={project}
        currentUserId="user-owner"
        legacyActions={[legacyAction]}
      />,
    );

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        canonical_id: "urn:app:action:legacy-1",
        name: "Legacy task",
        action_status: "ActiveActionStatus",
        due_at: "2026-03-01T12:00:00.000Z",
        tags: ["urgent"],
      }),
    );
    createSpy.mockRestore();
  });

  it("opens detail on double click and adds a comment", async () => {
    const action = makeAction({
      id: "action-1",
      name: "Ship release",
      comment_count: 0,
    });
    actionsData = [action];
    detailByActionId.set(action.id, makeActionDetail(action));
    historyByActionId.set(action.id, makeActionHistory());
    const user = userEvent.setup();

    renderWorkspace();

    const cardTitle = screen.getByDisplayValue("Ship release");
    const card = cardTitle.closest("article");
    expect(card).not.toBeNull();
    await user.dblClick(card!);

    expect(screen.getByText("Action detail")).toBeInTheDocument();
    const commentInput = screen.getByPlaceholderText(
      "Add a comment for collaborators...",
    );
    await user.type(commentInput, "Need design assets");
    await user.click(screen.getByRole("button", { name: "Add comment" }));

    expect(mockAddCommentMutate).toHaveBeenCalledWith(
      {
        actionId: "action-1",
        payload: {
          body: "Need design assets",
          parent_comment_id: undefined,
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    await waitFor(() => expect(commentInput).toHaveValue(""));
  });
});
