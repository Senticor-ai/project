import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectedBucketView } from "./ConnectedBucketView";
import type { Thing, Project, ReferenceMaterial } from "@/model/types";
import {
  createAction,
  createProject,
  createReferenceMaterial,
} from "@/model/factories";
import type { CanonicalId } from "@/model/canonical-id";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRefetch = vi.fn();

const mockAllThings = vi.fn<
  () => {
    data: Thing[];
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
    refetch: typeof mockRefetch;
  }
>();
const mockProjects = vi.fn<
  () => {
    data: Project[];
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
  }
>();
const mockReferences = vi.fn<
  () => {
    data: ReferenceMaterial[];
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
  }
>();

vi.mock("@/hooks/use-things", () => ({
  useAllThings: () => mockAllThings(),
  useProjects: () => mockProjects(),
  useReferences: () => mockReferences(),
}));

const mockCapture = { mutateAsync: vi.fn() };
const mockAddAction = { mutateAsync: vi.fn() };
const mockComplete = { mutate: vi.fn() };
const mockFocus = { mutate: vi.fn() };
const mockMove = { mutate: vi.fn() };
const mockAddRef = { mutate: vi.fn() };
const mockArchiveRef = { mutate: vi.fn() };
const mockUpdate = { mutate: vi.fn() };
const mockAddProjectAction = { mutate: vi.fn() };

vi.mock("@/hooks/use-mutations", () => ({
  useCaptureInbox: () => mockCapture,
  useAddAction: () => mockAddAction,
  useCompleteAction: () => mockComplete,
  useToggleFocus: () => mockFocus,
  useMoveAction: () => mockMove,
  useAddReference: () => mockAddRef,
  useArchiveReference: () => mockArchiveRef,
  useUpdateItem: () => mockUpdate,
  useAddProjectAction: () => mockAddProjectAction,
}));

// Capture BucketView props so we can invoke callbacks in tests
let capturedProps: Record<string, unknown> = {};
vi.mock("./BucketView", () => ({
  BucketView: (props: Record<string, unknown>) => {
    capturedProps = props;
    return (
      <div
        data-testid="bucket-view"
        data-bucket={props.activeBucket}
        data-thing-count={
          Array.isArray(props.things) ? props.things.length : 0
        }
      />
    );
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadedQuery<T>(data: T) {
  return {
    data,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: mockRefetch,
  };
}

function loadingQuery() {
  return {
    data: [] as unknown[],
    isLoading: true,
    isFetching: true,
    error: null,
    refetch: mockRefetch,
  };
}

function errorQuery(message: string) {
  return {
    data: [] as unknown[],
    isLoading: false,
    isFetching: false,
    error: new Error(message),
    refetch: mockRefetch,
  };
}

const mockBucketChange = vi.fn();

function renderComponent(bucket = "inbox" as const) {
  return render(
    <ConnectedBucketView
      activeBucket={bucket}
      onBucketChange={mockBucketChange}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConnectedBucketView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: loaded state with empty data
    mockAllThings.mockReturnValue(loadedQuery([]));
    mockProjects.mockReturnValue(loadedQuery([]));
    mockReferences.mockReturnValue(loadedQuery([]));
  });

  it("renders loading spinner when queries are loading", () => {
    mockAllThings.mockReturnValue(loadingQuery() as ReturnType<typeof mockAllThings>);
    renderComponent();

    const spinner = screen.getByText("progress_activity");
    expect(spinner).toBeInTheDocument();
    expect(screen.queryByTestId("bucket-view")).not.toBeInTheDocument();
  });

  it("renders error state with retry button", async () => {
    mockAllThings.mockReturnValue(
      errorQuery("Network error") as ReturnType<typeof mockAllThings>,
    );
    renderComponent();

    expect(screen.getByText("Failed to load data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByTestId("bucket-view")).not.toBeInTheDocument();
  });

  it("calls refetch when retry button is clicked", async () => {
    mockAllThings.mockReturnValue(
      errorQuery("fail") as ReturnType<typeof mockAllThings>,
    );
    renderComponent();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it("renders BucketView with data when loaded", () => {
    const things = [createAction({ name: "Task 1" })];
    mockAllThings.mockReturnValue(loadedQuery(things));
    renderComponent("next");

    const view = screen.getByTestId("bucket-view");
    expect(view).toHaveAttribute("data-bucket", "next");
    expect(view).toHaveAttribute("data-thing-count", "1");
  });

  it("shows progress bar during background refetch (after 400ms debounce)", () => {
    vi.useFakeTimers();
    mockAllThings.mockReturnValue({
      ...loadedQuery([]),
      isFetching: true,
    });
    renderComponent();

    // Not visible immediately (debounced)
    expect(
      screen.queryByRole("progressbar", { name: "Refreshing data" }),
    ).not.toBeInTheDocument();

    // Visible after 400ms
    act(() => vi.advanceTimersByTime(400));
    expect(
      screen.getByRole("progressbar", { name: "Refreshing data" }),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does not show progress bar when not fetching", () => {
    renderComponent();
    expect(
      screen.queryByRole("progressbar", { name: "Refreshing data" }),
    ).not.toBeInTheDocument();
  });

  it("passes projects and references to BucketView", () => {
    const projects = [
      createProject({ name: "Project A", desiredOutcome: "Done" }),
    ];
    const refs = [createReferenceMaterial({ name: "Ref 1" })];
    mockProjects.mockReturnValue(loadedQuery(projects));
    mockReferences.mockReturnValue(loadedQuery(refs));
    renderComponent();

    expect(screen.getByTestId("bucket-view")).toBeInTheDocument();
  });

  describe("callback handlers", () => {
    beforeEach(() => {
      renderComponent();
    });

    it("onAddThing calls captureInbox for inbox bucket", async () => {
      const onAddThing = capturedProps.onAddThing as (
        title: string,
        bucket: string,
      ) => Promise<void>;
      await onAddThing("New item", "inbox");
      expect(mockCapture.mutateAsync).toHaveBeenCalledWith("New item");
    });

    it("onAddThing calls addAction for non-inbox bucket", async () => {
      const onAddThing = capturedProps.onAddThing as (
        title: string,
        bucket: string,
      ) => Promise<void>;
      await onAddThing("New action", "next");
      expect(mockAddAction.mutateAsync).toHaveBeenCalledWith({
        title: "New action",
        bucket: "next",
      });
    });

    it("onCompleteThing calls complete mutation", () => {
      const onComplete = capturedProps.onCompleteThing as (
        id: CanonicalId,
      ) => void;
      onComplete("thing:test-1" as CanonicalId);
      expect(mockComplete.mutate).toHaveBeenCalledWith("thing:test-1");
    });

    it("onToggleFocus calls focus mutation", () => {
      const onToggleFocus = capturedProps.onToggleFocus as (
        id: CanonicalId,
      ) => void;
      onToggleFocus("thing:test-2" as CanonicalId);
      expect(mockFocus.mutate).toHaveBeenCalledWith("thing:test-2");
    });

    it("onMoveThing calls move mutation", () => {
      const onMove = capturedProps.onMoveThing as (
        id: CanonicalId,
        bucket: string,
      ) => void;
      onMove("thing:test-3" as CanonicalId, "waiting");
      expect(mockMove.mutate).toHaveBeenCalledWith({
        canonicalId: "thing:test-3",
        bucket: "waiting",
      });
    });

    it("onAddReference calls addReference mutation", () => {
      const onAddRef = capturedProps.onAddReference as (
        title: string,
      ) => void;
      onAddRef("New ref");
      expect(mockAddRef.mutate).toHaveBeenCalledWith("New ref");
    });

    it("onArchiveReference calls archiveReference mutation", () => {
      const onArchiveRef = capturedProps.onArchiveReference as (
        id: CanonicalId,
      ) => void;
      onArchiveRef("ref:test-1" as CanonicalId);
      expect(mockArchiveRef.mutate).toHaveBeenCalledWith("ref:test-1");
    });

    it("onUpdateTitle calls updateItem mutation", () => {
      const onUpdateTitle = capturedProps.onUpdateTitle as (
        id: CanonicalId,
        newTitle: string,
      ) => void;
      onUpdateTitle("thing:test-4" as CanonicalId, "Updated title");
      expect(mockUpdate.mutate).toHaveBeenCalledWith({
        canonicalId: "thing:test-4",
        patch: { title: "Updated title" },
      });
    });

    it("onEditThing calls updateItem with partial fields", () => {
      const onEdit = capturedProps.onEditThing as (
        id: CanonicalId,
        fields: Record<string, unknown>,
      ) => void;
      onEdit("thing:test-5" as CanonicalId, { description: "Updated" });
      expect(mockUpdate.mutate).toHaveBeenCalledWith({
        canonicalId: "thing:test-5",
        patch: { description: "Updated" },
      });
    });

    it("onAddProjectAction calls addProjectAction mutation", () => {
      const onAddProjAction = capturedProps.onAddProjectAction as (
        projectId: CanonicalId,
        title: string,
      ) => void;
      onAddProjAction("project:test-1" as CanonicalId, "Sub task");
      expect(mockAddProjectAction.mutate).toHaveBeenCalledWith({
        projectId: "project:test-1",
        title: "Sub task",
      });
    });
  });
});
