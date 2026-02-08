import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BucketView } from "./BucketView";
import {
  createThing,
  createReferenceMaterial,
  createProject,
  createAction,
} from "@/model/factories";

// Mock completed items hook (used by ThingList)
vi.mock("@/hooks/use-things", () => ({
  useAllCompletedThings: () => ({ data: [], isFetching: false }),
}));

// Mock @dnd-kit/core — provide DndContext as a pass-through wrapper
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
}));

const baseProps = {
  activeBucket: "inbox" as const,
  onBucketChange: vi.fn(),
  things: [
    createThing({ name: "Buy milk", bucket: "inbox" }),
    createAction({ name: "Call dentist", bucket: "next" }),
    createAction({ name: "Review docs", bucket: "waiting" }),
  ],
  onAddThing: vi.fn(),
  onCompleteThing: vi.fn(),
  onToggleFocus: vi.fn(),
  onMoveThing: vi.fn(),
  onArchiveThing: vi.fn(),
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

  it("renders ThingList for thing-type buckets", () => {
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
});
