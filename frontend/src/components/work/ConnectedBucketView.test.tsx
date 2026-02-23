import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectedBucketView } from "./ConnectedBucketView";
import type {
  ActionItem,
  Bucket,
  Project,
  ReferenceMaterial,
} from "@/model/types";
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

const mockAllItems = vi.fn<
  () => {
    data: ActionItem[];
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

vi.mock("@/hooks/use-items", () => ({
  useAllItems: () => mockAllItems(),
  useProjects: () => mockProjects(),
  useReferences: () => mockReferences(),
}));

vi.mock("@/hooks/use-organizations", () => ({
  useOrganizations: () => ({ data: [], isLoading: false, error: null }),
}));

const mockCapture = { mutateAsync: vi.fn() };
const mockCaptureFile = { mutateAsync: vi.fn() };
const mockAddAction = { mutateAsync: vi.fn() };
const mockComplete = { mutate: vi.fn() };
const mockFocus = { mutate: vi.fn() };
const mockMove = { mutate: vi.fn() };
const mockAddRef = { mutate: vi.fn() };
const mockArchiveRef = { mutate: vi.fn() };
const mockUpdate = { mutate: vi.fn() };
const mockAddProjectAction = { mutate: vi.fn() };
const mockCreateProject = { mutate: vi.fn() };

vi.mock("@/hooks/use-mutations", () => ({
  useCaptureInbox: () => mockCapture,
  useCaptureFile: () => mockCaptureFile,
  useAddAction: () => mockAddAction,
  useCompleteAction: () => mockComplete,
  useToggleFocus: () => mockFocus,
  useMoveAction: () => mockMove,
  useAddReference: () => mockAddRef,
  useArchiveReference: () => mockArchiveRef,
  useUpdateItem: () => mockUpdate,
  useAddProjectAction: () => mockAddProjectAction,
  useCreateProject: () => mockCreateProject,
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
        data-item-count={
          Array.isArray(props.actionItems) ? props.actionItems.length : 0
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

function renderComponent(bucket: Bucket = "inbox") {
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
    mockAllItems.mockReturnValue(loadedQuery([]));
    mockProjects.mockReturnValue(loadedQuery([]));
    mockReferences.mockReturnValue(loadedQuery([]));
    mockCaptureFile.mutateAsync.mockResolvedValue(undefined);
  });

  it("renders loading spinner when queries are loading", () => {
    mockAllItems.mockReturnValue(
      loadingQuery() as ReturnType<typeof mockAllItems>,
    );
    renderComponent();

    const spinner = screen.getByText("progress_activity");
    expect(spinner).toBeInTheDocument();
    expect(screen.queryByTestId("bucket-view")).not.toBeInTheDocument();
  });

  it("renders error state with retry button", async () => {
    mockAllItems.mockReturnValue(
      errorQuery("Network error") as ReturnType<typeof mockAllItems>,
    );
    renderComponent();

    expect(screen.getByText("Failed to load data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByTestId("bucket-view")).not.toBeInTheDocument();
  });

  it("calls refetch when retry button is clicked", async () => {
    mockAllItems.mockReturnValue(
      errorQuery("fail") as ReturnType<typeof mockAllItems>,
    );
    renderComponent();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it("renders BucketView with data when loaded", () => {
    const items = [createAction({ name: "Task 1" })];
    mockAllItems.mockReturnValue(loadedQuery(items));
    renderComponent("next");

    const view = screen.getByTestId("bucket-view");
    expect(view).toHaveAttribute("data-bucket", "next");
    expect(view).toHaveAttribute("data-item-count", "1");
  });

  it("shows progress bar during background refetch (after 400ms debounce)", () => {
    vi.useFakeTimers();
    mockAllItems.mockReturnValue({
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

    it("onAddActionItem calls captureInbox for inbox bucket", async () => {
      const onAddActionItem = capturedProps.onAddActionItem as (
        title: string,
        bucket: string,
      ) => Promise<void>;
      await onAddActionItem("New item", "inbox");
      expect(mockCapture.mutateAsync).toHaveBeenCalledWith("New item");
    });

    it("onAddActionItem calls addAction for non-inbox bucket", async () => {
      const onAddActionItem = capturedProps.onAddActionItem as (
        title: string,
        bucket: string,
      ) => Promise<void>;
      await onAddActionItem("New action", "next");
      expect(mockAddAction.mutateAsync).toHaveBeenCalledWith({
        title: "New action",
        bucket: "next",
      });
    });

    it("onCompleteActionItem calls complete mutation", () => {
      const onComplete = capturedProps.onCompleteActionItem as (
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

    it("onMoveActionItem calls move mutation", () => {
      const onMove = capturedProps.onMoveActionItem as (
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
      const onAddRef = capturedProps.onAddReference as (title: string) => void;
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
        nameSource?: string,
      ) => void;
      onUpdateTitle("thing:test-4" as CanonicalId, "Updated title");
      expect(mockUpdate.mutate).toHaveBeenCalledWith({
        canonicalId: "thing:test-4",
        patch: { name: "Updated title" },
      });
    });

    it("onUpdateTitle forwards nameSource when provided", () => {
      const onUpdateTitle = capturedProps.onUpdateTitle as (
        id: CanonicalId,
        newTitle: string,
        nameSource?: string,
      ) => void;
      onUpdateTitle(
        "thing:test-4" as CanonicalId,
        "Updated title",
        "user renamed in EditableTitle",
      );
      expect(mockUpdate.mutate).toHaveBeenCalledWith({
        canonicalId: "thing:test-4",
        patch: { name: "Updated title" },
        nameSource: "user renamed in EditableTitle",
      });
    });

    it("onEditActionItem calls updateItem with partial fields", () => {
      const onEdit = capturedProps.onEditActionItem as (
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

    it("onCreateProject calls createProject mutation", () => {
      const onCreateProject = capturedProps.onCreateProject as (
        name: string,
        desiredOutcome: string,
      ) => void;
      onCreateProject("New Project", "Ship it");
      expect(mockCreateProject.mutate).toHaveBeenCalledWith({
        name: "New Project",
        desiredOutcome: "Ship it",
      });
    });

    it("onArchiveProject updates project status to archived", () => {
      const onArchiveProject = capturedProps.onArchiveProject as (
        id: CanonicalId,
      ) => void;
      onArchiveProject("urn:app:project:test-1" as CanonicalId);
      expect(mockUpdate.mutate).toHaveBeenCalledWith({
        canonicalId: "urn:app:project:test-1",
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
      });
    });

    it("onFileDrop calls captureFile mutation for each file", () => {
      const onFileDrop = capturedProps.onFileDrop as (files: File[]) => void;
      const file1 = new File(["a"], "report.pdf", { type: "application/pdf" });
      const file2 = new File(["b"], "photo.png", { type: "image/png" });
      onFileDrop([file1, file2]);
      expect(mockCaptureFile.mutateAsync).toHaveBeenCalledTimes(2);
      expect(mockCaptureFile.mutateAsync).toHaveBeenNthCalledWith(1, file1);
      expect(mockCaptureFile.mutateAsync).toHaveBeenNthCalledWith(2, file2);
    });

    it("shows minimizable upload notice while background uploads are running", async () => {
      mockCaptureFile.mutateAsync.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      const onFileDrop = capturedProps.onFileDrop as (files: File[]) => void;
      const file = new File(["a"], "report.pdf", { type: "application/pdf" });

      act(() => {
        onFileDrop([file]);
      });

      expect(
        screen.getByRole("status", { name: "Background uploads" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Uploading 1 file in background"),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Minimize upload status" }),
      );
      expect(
        screen.getByRole("button", { name: "Show upload status" }),
      ).toBeInTheDocument();
    });

    it("clears upload notice when background upload succeeds", async () => {
      mockCaptureFile.mutateAsync.mockResolvedValue(undefined);
      const onFileDrop = capturedProps.onFileDrop as (files: File[]) => void;
      const file = new File(["a"], "report.pdf", { type: "application/pdf" });

      act(() => {
        onFileDrop([file]);
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(
        screen.queryByRole("status", { name: "Background uploads" }),
      ).not.toBeInTheDocument();
    });

    it("keeps failed upload notice until dismissed", async () => {
      mockCaptureFile.mutateAsync.mockRejectedValue(new Error("Upload failed"));
      const user = userEvent.setup();
      const onFileDrop = capturedProps.onFileDrop as (files: File[]) => void;
      const file = new File(["a"], "report.pdf", { type: "application/pdf" });

      act(() => {
        onFileDrop([file]);
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText("1 upload failed")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(
        screen.queryByRole("status", { name: "Background uploads" }),
      ).not.toBeInTheDocument();
    });
  });
});
