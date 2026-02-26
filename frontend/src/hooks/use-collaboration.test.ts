import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { CollaborationApi } from "@/lib/api-client";
import type {
  WorkflowDefinitionResponse,
  ProjectMemberResponse,
  ProjectActionResponse,
  ProjectActionDetailResponse,
  ProjectActionHistoryResponse,
} from "@/lib/api-client";
import {
  useProjectWorkflow,
  useProjectMembers,
  useProjectActions,
  useProjectActionDetail,
  useProjectActionHistory,
  useAddProjectMember,
  useRemoveProjectMember,
  useCreateProjectAction,
  useUpdateProjectAction,
  useTransitionProjectAction,
  useAddProjectActionComment,
} from "./use-collaboration";

vi.mock("@/lib/api-client", () => ({
  CollaborationApi: {
    getProjectWorkflow: vi.fn(),
    listProjectMembers: vi.fn(),
    listProjectActions: vi.fn(),
    getProjectAction: vi.fn(),
    getProjectActionHistory: vi.fn(),
    addProjectMember: vi.fn(),
    removeProjectMember: vi.fn(),
    createProjectAction: vi.fn(),
    updateProjectAction: vi.fn(),
    transitionProjectAction: vi.fn(),
    addProjectActionComment: vi.fn(),
  },
}));

const mocked = vi.mocked(CollaborationApi);

const WORKFLOW: WorkflowDefinitionResponse = {
  policy_mode: "kanban",
  default_status: "open",
  done_statuses: ["done"],
  blocked_statuses: ["blocked"],
  canonical_statuses: ["open", "in_progress", "done"],
  column_labels: { open: "Offen", in_progress: "In Arbeit", done: "Erledigt" },
  transitions: [{ from_status: "open", to_status: "in_progress" }],
};

const MEMBER: ProjectMemberResponse = {
  project_id: "proj-1",
  user_id: "user-1",
  email: "alice@example.com",
  role: "member",
  is_owner: false,
  added_at: "2025-01-01T00:00:00Z",
  added_by: null,
};

const ACTION: ProjectActionResponse = {
  id: "act-1",
  canonical_id: "urn:app:action:act-1",
  project_id: "proj-1",
  name: "Review PR",
  description: null,
  action_status: "open",
  owner_user_id: null,
  owner_text: null,
  due_at: null,
  tags: [],
  object_ref: null,
  attributes: {},
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  last_event_id: null,
  comment_count: 0,
};

const ACTION_DETAIL: ProjectActionDetailResponse = {
  ...ACTION,
  comments: [],
  revisions: [],
};

const ACTION_HISTORY: ProjectActionHistoryResponse = {
  transitions: [],
  revisions: [],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

describe("useProjectWorkflow", () => {
  it("fetches workflow when projectId is provided", async () => {
    mocked.getProjectWorkflow.mockResolvedValue(WORKFLOW);

    const { result } = renderHook(() => useProjectWorkflow("proj-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(WORKFLOW);
    expect(mocked.getProjectWorkflow).toHaveBeenCalledWith("proj-1");
  });

  it("does not fetch when projectId is null", () => {
    const { result } = renderHook(() => useProjectWorkflow(null), { wrapper });

    expect(result.current.isFetching).toBe(false);
    expect(mocked.getProjectWorkflow).not.toHaveBeenCalled();
  });
});

describe("useProjectMembers", () => {
  it("fetches members when projectId is provided", async () => {
    mocked.listProjectMembers.mockResolvedValue([MEMBER]);

    const { result } = renderHook(() => useProjectMembers("proj-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([MEMBER]);
    expect(mocked.listProjectMembers).toHaveBeenCalledWith("proj-1");
  });

  it("does not fetch when projectId is null", () => {
    const { result } = renderHook(() => useProjectMembers(null), { wrapper });

    expect(result.current.isFetching).toBe(false);
    expect(mocked.listProjectMembers).not.toHaveBeenCalled();
  });
});

describe("useProjectActions", () => {
  it("fetches actions when projectId is provided", async () => {
    mocked.listProjectActions.mockResolvedValue([ACTION]);

    const { result } = renderHook(() => useProjectActions("proj-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([ACTION]);
    expect(mocked.listProjectActions).toHaveBeenCalledWith("proj-1", {
      status: [],
      tag: undefined,
      owner_user_id: undefined,
      due_before: undefined,
      due_after: undefined,
    });
  });

  it("passes filter params to the API", async () => {
    mocked.listProjectActions.mockResolvedValue([ACTION]);

    const params = { status: ["open"], tag: "urgent" };
    const { result } = renderHook(() => useProjectActions("proj-1", params), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.listProjectActions).toHaveBeenCalledWith("proj-1", {
      status: ["open"],
      tag: "urgent",
      owner_user_id: undefined,
      due_before: undefined,
      due_after: undefined,
    });
  });

  it("does not fetch when projectId is null", () => {
    const { result } = renderHook(() => useProjectActions(null), { wrapper });

    expect(result.current.isFetching).toBe(false);
    expect(mocked.listProjectActions).not.toHaveBeenCalled();
  });
});

describe("useProjectActionDetail", () => {
  it("fetches action detail", async () => {
    mocked.getProjectAction.mockResolvedValue(ACTION_DETAIL);

    const { result } = renderHook(
      () => useProjectActionDetail("proj-1", "act-1"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(ACTION_DETAIL);
    expect(mocked.getProjectAction).toHaveBeenCalledWith("proj-1", "act-1");
  });

  it("does not fetch when actionId is null", () => {
    const { result } = renderHook(
      () => useProjectActionDetail("proj-1", null),
      { wrapper },
    );

    expect(result.current.isFetching).toBe(false);
    expect(mocked.getProjectAction).not.toHaveBeenCalled();
  });
});

describe("useProjectActionHistory", () => {
  it("fetches action history", async () => {
    mocked.getProjectActionHistory.mockResolvedValue(ACTION_HISTORY);

    const { result } = renderHook(
      () => useProjectActionHistory("proj-1", "act-1"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(ACTION_HISTORY);
    expect(mocked.getProjectActionHistory).toHaveBeenCalledWith(
      "proj-1",
      "act-1",
    );
  });

  it("does not fetch when actionId is null", () => {
    const { result } = renderHook(
      () => useProjectActionHistory("proj-1", null),
      { wrapper },
    );

    expect(result.current.isFetching).toBe(false);
    expect(mocked.getProjectActionHistory).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

describe("useAddProjectMember", () => {
  it("calls addProjectMember with payload", async () => {
    mocked.addProjectMember.mockResolvedValue(MEMBER);

    const { result } = renderHook(() => useAddProjectMember("proj-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        email: "bob@example.com",
        role: "member",
      });
    });

    expect(mocked.addProjectMember).toHaveBeenCalledWith("proj-1", {
      email: "bob@example.com",
      role: "member",
    });
  });
});

describe("useRemoveProjectMember", () => {
  it("calls removeProjectMember with target user id", async () => {
    mocked.removeProjectMember.mockResolvedValue({
      ok: true,
      project_id: "proj-1",
      user_id: "user-2",
    });

    const { result } = renderHook(() => useRemoveProjectMember("proj-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync("user-2");
    });

    expect(mocked.removeProjectMember).toHaveBeenCalledWith("proj-1", "user-2");
  });
});

describe("useCreateProjectAction", () => {
  it("calls createProjectAction with payload", async () => {
    mocked.createProjectAction.mockResolvedValue(ACTION);

    const { result } = renderHook(() => useCreateProjectAction("proj-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ name: "New task" });
    });

    expect(mocked.createProjectAction).toHaveBeenCalledWith("proj-1", {
      name: "New task",
    });
  });
});

describe("useUpdateProjectAction", () => {
  it("calls updateProjectAction with action id and payload", async () => {
    mocked.updateProjectAction.mockResolvedValue(ACTION);

    const { result } = renderHook(() => useUpdateProjectAction("proj-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        actionId: "act-1",
        payload: { name: "Updated" },
      });
    });

    expect(mocked.updateProjectAction).toHaveBeenCalledWith("proj-1", "act-1", {
      name: "Updated",
    });
  });
});

describe("useTransitionProjectAction", () => {
  it("calls transitionProjectAction with action id and payload", async () => {
    mocked.transitionProjectAction.mockResolvedValue(ACTION);

    const { result } = renderHook(() => useTransitionProjectAction("proj-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        actionId: "act-1",
        payload: { to_status: "done" },
      });
    });

    expect(mocked.transitionProjectAction).toHaveBeenCalledWith(
      "proj-1",
      "act-1",
      { to_status: "done" },
    );
  });
});

describe("useAddProjectActionComment", () => {
  it("calls addProjectActionComment with action id and payload", async () => {
    mocked.addProjectActionComment.mockResolvedValue({
      id: "comment-1",
      action_id: "act-1",
      author_id: "user-1",
      parent_comment_id: null,
      body: "LGTM",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    });

    const { result } = renderHook(() => useAddProjectActionComment("proj-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        actionId: "act-1",
        payload: { body: "LGTM" },
      });
    });

    expect(mocked.addProjectActionComment).toHaveBeenCalledWith(
      "proj-1",
      "act-1",
      { body: "LGTM" },
    );
  });
});
