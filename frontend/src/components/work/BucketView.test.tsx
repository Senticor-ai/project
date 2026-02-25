import { describe, it, expect, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { BucketView } from "./BucketView";
import {
  createActionItem,
  createReferenceMaterial,
  createProject,
  createAction,
} from "@/model/factories";
import type { Bucket } from "@/model/types";

// Mock completed items hook (used by ActionList)
vi.mock("@/hooks/use-items", () => ({
  ITEMS_QUERY_KEY: ["items"],
  useAllCompletedItems: () => ({ data: [], isFetching: false }),
}));

// Mock @dnd-kit/core — capture onDragStart/onDragEnd for testing drag handler
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
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  useDndMonitor: () => {},
}));

const baseProps = {
  activeBucket: "inbox" as const,
  onBucketChange: vi.fn(),
  actionItems: [
    createActionItem({ name: "Buy milk", bucket: "inbox" }),
    createAction({ name: "Call dentist", bucket: "next" }),
    createAction({ name: "Review docs", bucket: "waiting" }),
  ],
  onAddActionItem: vi.fn(),
  onCompleteActionItem: vi.fn(),
  onToggleFocus: vi.fn(),
  onMoveActionItem: vi.fn(),
  onArchiveActionItem: vi.fn(),
};

describe("BucketView", () => {
  it("renders BucketNav and shows bucket content", () => {
    render(<BucketView {...baseProps} />);
    // Nav is present
    expect(
      screen.getByRole("navigation", { name: "Buckets" }),
    ).toBeInTheDocument();
    // Main content area is present
    expect(
      screen.getByRole("main", { name: "Bucket content" }),
    ).toBeInTheDocument();
  });

  it("shows inbox count in the nav", () => {
    render(<BucketView {...baseProps} />);
    // The inbox nav button (inside <nav>) should show the count badge
    const nav = screen.getByRole("navigation", { name: "Buckets" });
    const inboxBtn = within(nav).getByText("Inbox").closest("button")!;
    expect(inboxBtn).toHaveTextContent("1");
  });

  it("renders ActionList for thing-type buckets", () => {
    render(<BucketView {...baseProps} activeBucket="next" />);
    // The "next" action should appear in the list
    expect(screen.getByText("Call dentist")).toBeInTheDocument();
  });

  it("renders ReferenceList when reference bucket is active", () => {
    const refs = [createReferenceMaterial({ name: "Tax guidelines 2024" })];
    render(
      <BucketView
        {...baseProps}
        activeBucket="reference"
        referenceItems={refs}
      />,
    );
    expect(screen.getByText("Tax guidelines 2024")).toBeInTheDocument();
  });

  it("renders ProjectTree when project bucket is active", () => {
    const projects = [
      createProject({
        name: "Website Redesign",
        desiredOutcome: "New website launched",
      }),
    ];
    render(
      <BucketView {...baseProps} activeBucket="project" projects={projects} />,
    );
    expect(screen.getByText("Website Redesign")).toBeInTheDocument();
  });

  it("calls onBucketChange when a nav item is clicked", async () => {
    const onBucketChange = vi.fn();
    const user = userEvent.setup();
    render(<BucketView {...baseProps} onBucketChange={onBucketChange} />);

    const nav = screen.getByRole("navigation", { name: "Buckets" });
    await user.click(within(nav).getByText("Calendar"));
    expect(onBucketChange).toHaveBeenCalledWith("calendar");
  });

  it("opens Projects and auto-expands clicked starred project from nav", async () => {
    const user = userEvent.setup();
    const project = createProject({
      name: "Starred Project",
      desiredOutcome: "Ship release",
      isFocused: true,
      status: "active",
    });
    const action = createAction({
      name: "Project action",
      bucket: "next",
      projectId: project.id,
    });

    function Harness() {
      const [activeBucket, setActiveBucket] = useState<Bucket>("inbox");
      return (
        <BucketView
          {...baseProps}
          activeBucket={activeBucket}
          onBucketChange={setActiveBucket}
          projects={[project]}
          actionItems={[action]}
        />
      );
    }

    render(<Harness />);

    await user.click(screen.getByText("Starred Project"));

    await waitFor(() => {
      expect(screen.getByText("Project action")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Count calculations
// ---------------------------------------------------------------------------

describe("BucketView counts", () => {
  it("excludes completed items from bucket counts", () => {
    const things = [
      createActionItem({ name: "Active inbox", bucket: "inbox" }),
      createActionItem({
        name: "Done inbox",
        bucket: "inbox",
        completedAt: "2026-01-01T00:00:00Z",
      }),
      createAction({ name: "Active next", bucket: "next" }),
      createAction({
        name: "Done next",
        bucket: "next",
        completedAt: "2026-01-01T00:00:00Z",
      }),
    ];
    render(<BucketView {...baseProps} actionItems={things} />);
    const nav = screen.getByRole("navigation", { name: "Buckets" });
    const inboxBtn = within(nav).getByText("Inbox").closest("button")!;
    expect(inboxBtn).toHaveTextContent("1");
    const nextBtn = within(nav).getByText("Next").closest("button")!;
    expect(nextBtn).toHaveTextContent("1");
  });

  it("counts focused items across all buckets", () => {
    const things = [
      createAction({
        name: "Focused next",
        bucket: "next",
        isFocused: true,
      }),
      createAction({
        name: "Focused waiting",
        bucket: "waiting",
        isFocused: true,
      }),
      createAction({ name: "Not focused", bucket: "next" }),
    ];
    render(<BucketView {...baseProps} actionItems={things} />);
    const nav = screen.getByRole("navigation", { name: "Buckets" });
    const focusBtn = within(nav).getByText("Focus").closest("button")!;
    expect(focusBtn).toHaveTextContent("2");
  });

  it("excludes archived references from reference count", () => {
    const refs = [
      createReferenceMaterial({ name: "Active ref" }),
      createReferenceMaterial({
        name: "Archived ref",
        provenance: {
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          archivedAt: "2026-01-02T00:00:00Z",
          history: [],
        },
      }),
    ];
    render(
      <BucketView {...baseProps} actionItems={[]} referenceItems={refs} />,
    );
    const nav = screen.getByRole("navigation", { name: "Buckets" });
    const refBtn = within(nav).getByText("Reference").closest("button")!;
    expect(refBtn).toHaveTextContent("1");
  });

  it("counts only active projects", () => {
    const projects = [
      createProject({
        name: "Active",
        desiredOutcome: "Ship it",
        status: "active",
      }),
      createProject({
        name: "Completed",
        desiredOutcome: "Done",
        status: "completed",
      }),
    ];
    render(<BucketView {...baseProps} actionItems={[]} projects={projects} />);
    const nav = screen.getByRole("navigation", { name: "Buckets" });
    const projBtn = within(nav).getByText("Projects").closest("button")!;
    expect(projBtn).toHaveTextContent("1");
  });
});

// ---------------------------------------------------------------------------
// Focus bucket behavior
// ---------------------------------------------------------------------------

describe("BucketView focus bucket", () => {
  it("shows only focused items in focus view", () => {
    const things = [
      createAction({
        name: "Focused action",
        bucket: "next",
        isFocused: true,
      }),
      createAction({ name: "Not focused", bucket: "next" }),
    ];
    render(
      <BucketView {...baseProps} activeBucket="focus" actionItems={things} />,
    );
    expect(screen.getByText("Focused action")).toBeInTheDocument();
    expect(screen.queryByText("Not focused")).not.toBeInTheDocument();
  });

  it("shows bucket badge on items in focus view", () => {
    const things = [
      createAction({
        name: "Focused action",
        bucket: "next",
        isFocused: true,
      }),
    ];
    render(
      <BucketView {...baseProps} activeBucket="focus" actionItems={things} />,
    );
    // Focus view shows BucketBadge for each item (showBucket=true in ActionList)
    const main = screen.getByRole("main", { name: "Bucket content" });
    expect(within(main).getByText("Next")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// No-op callback defaults
// ---------------------------------------------------------------------------

describe("BucketView optional callbacks", () => {
  it("renders reference view without optional callbacks", () => {
    const refs = [createReferenceMaterial({ name: "Some doc" })];
    render(
      <BucketView
        {...baseProps}
        activeBucket="reference"
        referenceItems={refs}
      />,
    );
    expect(screen.getByText("Some doc")).toBeInTheDocument();
  });

  it("renders project view without optional callbacks", () => {
    const projects = [
      createProject({
        name: "My Project",
        desiredOutcome: "Delivered",
      }),
    ];
    render(
      <BucketView {...baseProps} activeBucket="project" projects={projects} />,
    );
    expect(screen.getByText("My Project")).toBeInTheDocument();
  });

  it("shows file drop zone when files are dragged into inbox", () => {
    const onFileDrop = vi.fn();
    render(
      <BucketView
        {...baseProps}
        activeBucket="inbox"
        onFileDrop={onFileDrop}
      />,
    );
    // Hidden at rest
    expect(screen.queryByTestId("file-drop-zone")).not.toBeInTheDocument();

    // Appears on file drag
    act(() => {
      fireEvent.dragEnter(document, {
        dataTransfer: { types: ["Files"] },
      });
    });
    expect(screen.getByTestId("file-drop-zone")).toBeInTheDocument();
  });

  it("does not show file drop zone when onFileDrop is not provided", () => {
    render(<BucketView {...baseProps} activeBucket="inbox" />);
    act(() => {
      fireEvent.dragEnter(document, {
        dataTransfer: { types: ["Files"] },
      });
    });
    expect(screen.queryByTestId("file-drop-zone")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Drag and drop
// ---------------------------------------------------------------------------

describe("BucketView drag and drop", () => {
  it("calls onMoveActionItem when item is dropped on a bucket", () => {
    const onMoveActionItem = vi.fn();
    const thing = createAction({ name: "Drag me", bucket: "next" });
    render(
      <BucketView
        {...baseProps}
        actionItems={[thing]}
        onMoveActionItem={onMoveActionItem}
      />,
    );
    capturedOnDragEnd?.({
      active: { id: thing.id },
      over: { data: { current: { bucket: "someday" } } },
    });
    expect(onMoveActionItem).toHaveBeenCalledWith(
      thing.id,
      "someday",
      undefined,
    );
  });

  it("does not call onMoveActionItem when drop target is null", () => {
    const onMoveActionItem = vi.fn();
    render(<BucketView {...baseProps} onMoveActionItem={onMoveActionItem} />);
    capturedOnDragEnd?.({
      active: { id: "urn:app:action:1" },
      over: null,
    });
    expect(onMoveActionItem).not.toHaveBeenCalled();
  });

  it("does not call onMoveActionItem when drop target has no bucket", () => {
    const onMoveActionItem = vi.fn();
    render(<BucketView {...baseProps} onMoveActionItem={onMoveActionItem} />);
    capturedOnDragEnd?.({
      active: { id: "urn:app:action:1" },
      over: { data: { current: {} } },
    });
    expect(onMoveActionItem).not.toHaveBeenCalled();
  });

  it("shows drag overlay with item name during drag", () => {
    const thing = createAction({ name: "Drag me", bucket: "next" });
    render(
      <BucketView {...baseProps} actionItems={[thing]} activeBucket="next" />,
    );

    const overlay = screen.getByTestId("drag-overlay");
    // Before drag starts, overlay should be empty
    expect(overlay).toBeEmptyDOMElement();

    // Simulate drag start — state update needs act()
    act(() => {
      capturedOnDragStart?.({
        active: { id: thing.id, data: { current: { type: "thing", thing } } },
      });
    });

    // Re-render picks up state — overlay now contains item name
    expect(overlay).toHaveTextContent("Drag me");
  });

  it("clears drag overlay when drag ends", () => {
    const thing = createAction({ name: "Drag me", bucket: "next" });
    render(
      <BucketView {...baseProps} actionItems={[thing]} activeBucket="next" />,
    );

    act(() => {
      capturedOnDragStart?.({
        active: { id: thing.id, data: { current: { type: "thing", thing } } },
      });
    });
    const overlay = screen.getByTestId("drag-overlay");
    expect(overlay).toHaveTextContent("Drag me");

    act(() => {
      capturedOnDragEnd?.({
        active: { id: thing.id },
        over: null,
      });
    });
    expect(overlay).toBeEmptyDOMElement();
  });

  it("calls onToggleFocus when item is dropped on focus bucket", () => {
    const onToggleFocus = vi.fn();
    const onMoveActionItem = vi.fn();
    const thing = createAction({ name: "Focus me", bucket: "next" });
    render(
      <BucketView
        {...baseProps}
        actionItems={[thing]}
        onToggleFocus={onToggleFocus}
        onMoveActionItem={onMoveActionItem}
      />,
    );
    capturedOnDragEnd?.({
      active: { id: thing.id },
      over: { data: { current: { bucket: "focus" } } },
    });
    expect(onToggleFocus).toHaveBeenCalledWith(thing.id);
    expect(onMoveActionItem).not.toHaveBeenCalled();
  });

  it("passes projectId from drop target to onMoveActionItem", () => {
    const onMoveActionItem = vi.fn();
    const thing = createAction({ name: "Move to project", bucket: "inbox" });
    render(
      <BucketView
        {...baseProps}
        actionItems={[thing]}
        onMoveActionItem={onMoveActionItem}
      />,
    );
    capturedOnDragEnd?.({
      active: { id: thing.id },
      over: {
        data: {
          current: {
            bucket: "next",
            projectId: "urn:app:project:tax-2024",
          },
        },
      },
    });
    expect(onMoveActionItem).toHaveBeenCalledWith(
      thing.id,
      "next",
      "urn:app:project:tax-2024",
    );
  });

  it("shows drag overlay for reference items", () => {
    const ref = createReferenceMaterial({ name: "Tax docs" });
    render(
      <BucketView
        {...baseProps}
        activeBucket="reference"
        referenceItems={[ref]}
      />,
    );

    const overlay = screen.getByTestId("drag-overlay");
    expect(overlay).toBeEmptyDOMElement();

    act(() => {
      capturedOnDragStart?.({
        active: {
          id: ref.id,
          data: { current: { type: "reference", thing: ref } },
        },
      });
    });

    expect(overlay).toHaveTextContent("Tax docs");
  });
});
