import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThingList } from "./ThingList";
import { createThing, resetFactoryCounter } from "@/model/factories";
import type { CanonicalId } from "@/model/canonical-id";

// dnd-kit stub (ThingRow uses useDraggable)
vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
}));

beforeEach(() => resetFactoryCounter());

const noop = vi.fn();

function defaultProps(
  overrides: Partial<Parameters<typeof ThingList>[0]> = {},
) {
  return {
    bucket: "next" as const,
    things: [] as ReturnType<typeof createThing>[],
    onAdd: noop,
    onComplete: noop,
    onToggleFocus: noop,
    onMove: noop,
    onArchive: noop,
    ...overrides,
  };
}

describe("ThingList", () => {
  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  it("renders bucket header for inbox", () => {
    render(<ThingList {...defaultProps({ bucket: "inbox" })} />);
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Capture and clarify")).toBeInTheDocument();
  });

  it("renders bucket header for next", () => {
    render(<ThingList {...defaultProps({ bucket: "next" })} />);
    expect(screen.getByText("Next Actions")).toBeInTheDocument();
    expect(screen.getByText("To-do's for anytime")).toBeInTheDocument();
  });

  it("renders bucket header for focus", () => {
    render(<ThingList {...defaultProps({ bucket: "focus" })} />);
    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("Starred actions")).toBeInTheDocument();
  });

  it("renders bucket header for waiting", () => {
    render(<ThingList {...defaultProps({ bucket: "waiting" })} />);
    expect(screen.getByText("Waiting For")).toBeInTheDocument();
  });

  it("renders bucket header for calendar", () => {
    render(<ThingList {...defaultProps({ bucket: "calendar" })} />);
    expect(screen.getByText("Calendar")).toBeInTheDocument();
  });

  it("renders bucket header for someday", () => {
    render(<ThingList {...defaultProps({ bucket: "someday" })} />);
    expect(screen.getByText("Someday / Maybe")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Empty states
  // -------------------------------------------------------------------------

  it("shows empty state for inbox", () => {
    render(<ThingList {...defaultProps({ bucket: "inbox" })} />);
    expect(screen.getByText("Inbox is empty")).toBeInTheDocument();
    expect(
      screen.getByText("Capture a thought to get started"),
    ).toBeInTheDocument();
  });

  it("shows empty state for next actions", () => {
    render(<ThingList {...defaultProps({ bucket: "next" })} />);
    expect(screen.getByText("No actions here yet")).toBeInTheDocument();
  });

  it("shows empty state for focus", () => {
    render(<ThingList {...defaultProps({ bucket: "focus" })} />);
    expect(screen.getByText("No focused actions")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Filtering by bucket
  // -------------------------------------------------------------------------

  it("filters things by bucket", () => {
    const things = [
      createThing({ title: "Next task", bucket: "next" }),
      createThing({ title: "Inbox task", bucket: "inbox" }),
      createThing({ title: "Someday task", bucket: "someday" }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);
    expect(screen.getByText("Next task")).toBeInTheDocument();
    expect(screen.queryByText("Inbox task")).not.toBeInTheDocument();
    expect(screen.queryByText("Someday task")).not.toBeInTheDocument();
  });

  it("shows focused things in focus view regardless of bucket", () => {
    const things = [
      createThing({
        title: "Focused next",
        bucket: "next",
        isFocused: true,
      }),
      createThing({
        title: "Focused waiting",
        bucket: "waiting",
        isFocused: true,
      }),
      createThing({ title: "Unfocused next", bucket: "next" }),
    ];
    render(<ThingList {...defaultProps({ bucket: "focus", things })} />);
    expect(screen.getByText("Focused next")).toBeInTheDocument();
    expect(screen.getByText("Focused waiting")).toBeInTheDocument();
    expect(screen.queryByText("Unfocused next")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Completed items
  // -------------------------------------------------------------------------

  it("hides completed things by default", () => {
    const things = [
      createThing({ title: "Active", bucket: "next" }),
      createThing({
        title: "Done",
        bucket: "next",
        completedAt: new Date().toISOString(),
      }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("does not show completed toggle when no completed items", () => {
    const things = [createThing({ title: "Active", bucket: "next" })];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);
    expect(screen.queryByLabelText("Show completed")).not.toBeInTheDocument();
  });

  it("shows completed toggle when completed items exist", () => {
    const things = [
      createThing({ title: "Active", bucket: "next" }),
      createThing({
        title: "Done",
        bucket: "next",
        completedAt: "2026-01-20T10:00:00Z",
      }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);
    expect(screen.getByLabelText("Show completed")).toBeInTheDocument();
  });

  it("shows completed items after toggle click", async () => {
    const user = userEvent.setup();
    const things = [
      createThing({ title: "Active task", bucket: "next" }),
      createThing({
        title: "Done task A",
        bucket: "next",
        completedAt: "2026-01-20T10:00:00Z",
      }),
      createThing({
        title: "Done task B",
        bucket: "next",
        completedAt: "2026-01-18T10:00:00Z",
      }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);

    expect(screen.queryByText("Done task A")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Show completed"));

    expect(screen.getByText("Done task A")).toBeInTheDocument();
    expect(screen.getByText("Done task B")).toBeInTheDocument();
    expect(screen.getByText("2 completed")).toBeInTheDocument();
    expect(screen.getByText("(+2 done)")).toBeInTheDocument();
  });

  it("hides completed items after toggling off", async () => {
    const user = userEvent.setup();
    const things = [
      createThing({ title: "Active", bucket: "next" }),
      createThing({
        title: "Done",
        bucket: "next",
        completedAt: "2026-01-20T10:00:00Z",
      }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);

    await user.click(screen.getByLabelText("Show completed"));
    expect(screen.getByText("Done")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Hide completed"));
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("completed section appears below active items", async () => {
    const user = userEvent.setup();
    const things = [
      createThing({ title: "Active item", bucket: "next" }),
      createThing({
        title: "Done item",
        bucket: "next",
        completedAt: "2026-01-20T10:00:00Z",
      }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);

    await user.click(screen.getByLabelText("Show completed"));

    const active = screen.getByText("Active item");
    const done = screen.getByText("Done item");
    expect(
      active.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Footer count
  // -------------------------------------------------------------------------

  it("shows action count for action buckets", () => {
    const things = [
      createThing({ title: "Task A", bucket: "next" }),
      createThing({ title: "Task B", bucket: "next" }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);
    expect(screen.getByText("2 actions")).toBeInTheDocument();
  });

  it("shows item count for inbox", () => {
    const things = [
      createThing({ title: "Thought A", bucket: "inbox" }),
      createThing({ title: "Thought B", bucket: "inbox" }),
      createThing({ title: "Thought C", bucket: "inbox" }),
    ];
    render(<ThingList {...defaultProps({ bucket: "inbox", things })} />);
    expect(screen.getByText("3 items to process")).toBeInTheDocument();
  });

  it("uses singular 'action' for single item", () => {
    const things = [createThing({ title: "Solo", bucket: "next" })];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);
    expect(screen.getByText("1 action")).toBeInTheDocument();
  });

  it("uses singular 'item' for single inbox item", () => {
    const things = [createThing({ title: "Solo", bucket: "inbox" })];
    render(<ThingList {...defaultProps({ bucket: "inbox", things })} />);
    expect(screen.getByText("1 item to process")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Rapid entry / capture
  // -------------------------------------------------------------------------

  it("shows capture input for inbox", () => {
    render(<ThingList {...defaultProps({ bucket: "inbox" })} />);
    expect(screen.getByLabelText("Capture a thought")).toBeInTheDocument();
  });

  it("shows rapid entry for action buckets", () => {
    render(<ThingList {...defaultProps({ bucket: "next" })} />);
    expect(screen.getByLabelText("Rapid entry")).toBeInTheDocument();
  });

  it("hides rapid entry in focus view", () => {
    render(<ThingList {...defaultProps({ bucket: "focus" })} />);
    expect(screen.queryByLabelText("Rapid entry")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Capture a thought"),
    ).not.toBeInTheDocument();
  });

  it("calls onAdd via rapid entry", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ThingList {...defaultProps({ bucket: "next", onAdd })} />);
    const input = screen.getByLabelText("Rapid entry");
    await user.type(input, "New task{Enter}");
    expect(onAdd).toHaveBeenCalledWith("New task");
  });

  it("calls onAdd via inbox capture", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ThingList {...defaultProps({ bucket: "inbox", onAdd })} />);
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "New thought{Enter}");
    expect(onAdd).toHaveBeenCalledWith("New thought");
  });

  it("does not call onAdd for empty input", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ThingList {...defaultProps({ bucket: "next", onAdd })} />);
    const input = screen.getByLabelText("Rapid entry");
    await user.type(input, "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------

  it("sorts inbox items FIFO (oldest first)", () => {
    const things = [
      createThing({
        title: "Newer",
        bucket: "inbox",
        provenance: {
          createdAt: "2026-02-05T10:00:00Z",
          updatedAt: "2026-02-05T10:00:00Z",
          history: [],
        },
      }),
      createThing({
        title: "Older",
        bucket: "inbox",
        provenance: {
          createdAt: "2026-02-01T10:00:00Z",
          updatedAt: "2026-02-01T10:00:00Z",
          history: [],
        },
      }),
    ];
    render(<ThingList {...defaultProps({ bucket: "inbox", things })} />);

    const older = screen.getByText("Older");
    const newer = screen.getByText("Newer");
    expect(
      older.compareDocumentPosition(newer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("sorts focused actions first in action buckets", () => {
    const things = [
      createThing({ title: "Unfocused first", bucket: "next" }),
      createThing({
        title: "Focused second",
        bucket: "next",
        isFocused: true,
      }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);

    const focused = screen.getByText("Focused second");
    const unfocused = screen.getByText("Unfocused first");
    expect(
      focused.compareDocumentPosition(unfocused) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Expand / collapse
  // -------------------------------------------------------------------------

  it("expands item editor on title click when onEdit provided", async () => {
    const user = userEvent.setup();
    const things = [createThing({ title: "Editable item", bucket: "next" })];
    render(
      <ThingList
        {...defaultProps({ bucket: "next", things, onEdit: vi.fn() })}
      />,
    );
    await user.click(screen.getByText("Editable item"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();
  });

  it("only expands one item at a time", async () => {
    const user = userEvent.setup();
    const things = [
      createThing({ title: "First item", bucket: "next" }),
      createThing({ title: "Second item", bucket: "next" }),
    ];
    render(
      <ThingList
        {...defaultProps({ bucket: "next", things, onEdit: vi.fn() })}
      />,
    );
    await user.click(screen.getByText("First item"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();

    await user.click(screen.getByText("Second item"));
    expect(screen.getAllByText("Complexity")).toHaveLength(1);
  });

  it("does not expand when no onEdit or onUpdateTitle", async () => {
    const user = userEvent.setup();
    const things = [createThing({ title: "Static item", bucket: "next" })];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);
    await user.click(screen.getByText("Static item"));
    expect(screen.queryByText("Complexity")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Title editing lifecycle
  // -------------------------------------------------------------------------

  it("enables expand when onUpdateTitle provided", async () => {
    const user = userEvent.setup();
    const things = [createThing({ title: "Expandable item", bucket: "next" })];
    render(
      <ThingList
        {...defaultProps({
          bucket: "next",
          things,
          onUpdateTitle: vi.fn(),
        })}
      />,
    );
    await user.click(screen.getByText("Expandable item"));
    expect(screen.getByDisplayValue("Expandable item")).toBeInTheDocument();
  });

  it("calls onUpdateTitle when title edited via Enter", async () => {
    const user = userEvent.setup();
    const things = [createThing({ title: "Edit me", bucket: "next" })];
    const onUpdateTitle = vi.fn();
    render(
      <ThingList
        {...defaultProps({ bucket: "next", things, onUpdateTitle })}
      />,
    );
    await user.click(screen.getByText("Edit me"));
    const input = screen.getByDisplayValue("Edit me");
    await user.clear(input);
    await user.type(input, "Edited title");
    await user.keyboard("{Enter}");

    expect(onUpdateTitle).toHaveBeenCalledWith(things[0].id, "Edited title");
  });

  it("does not call onUpdateTitle on Escape", async () => {
    const user = userEvent.setup();
    const things = [createThing({ title: "Keep me", bucket: "next" })];
    const onUpdateTitle = vi.fn();
    render(
      <ThingList
        {...defaultProps({ bucket: "next", things, onUpdateTitle })}
      />,
    );
    await user.click(screen.getByText("Keep me"));
    const input = screen.getByDisplayValue("Keep me");
    await user.clear(input);
    await user.type(input, "Changed");
    await user.keyboard("{Escape}");

    expect(onUpdateTitle).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Context filter integration
  // -------------------------------------------------------------------------

  it("does not render context filter bar when no things have contexts", () => {
    const things = [createThing({ title: "No ctx", bucket: "next" })];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);
    expect(
      screen.queryByRole("group", { name: "Filter by context" }),
    ).not.toBeInTheDocument();
  });

  it("renders context filter bar when things have contexts", () => {
    const things = [
      createThing({
        title: "Call boss",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);
    expect(
      screen.getByRole("group", { name: "Filter by context" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /@phone/ }),
    ).toBeInTheDocument();
  });

  it("clicking a context chip filters displayed things", async () => {
    const user = userEvent.setup();
    const things = [
      createThing({
        title: "Call boss",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
      createThing({
        title: "Write report",
        bucket: "next",
        contexts: ["@computer"] as unknown as CanonicalId[],
      }),
      createThing({
        title: "Email team",
        bucket: "next",
        contexts: ["@phone", "@computer"] as unknown as CanonicalId[],
      }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);

    expect(screen.getByText("Call boss")).toBeInTheDocument();
    expect(screen.getByText("Write report")).toBeInTheDocument();
    expect(screen.getByText("Email team")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /@phone/ }));

    expect(screen.getByText("Call boss")).toBeInTheDocument();
    expect(screen.getByText("Email team")).toBeInTheDocument();
    expect(screen.queryByText("Write report")).not.toBeInTheDocument();
  });

  it("multiple context selection uses OR logic", async () => {
    const user = userEvent.setup();
    const things = [
      createThing({
        title: "Phone task",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
      createThing({
        title: "Computer task",
        bucket: "next",
        contexts: ["@computer"] as unknown as CanonicalId[],
      }),
      createThing({
        title: "Office task",
        bucket: "next",
        contexts: ["@office"] as unknown as CanonicalId[],
      }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);

    await user.click(screen.getByRole("checkbox", { name: /@phone/ }));
    await user.click(screen.getByRole("checkbox", { name: /@computer/ }));

    expect(screen.getByText("Phone task")).toBeInTheDocument();
    expect(screen.getByText("Computer task")).toBeInTheDocument();
    expect(screen.queryByText("Office task")).not.toBeInTheDocument();
  });

  it("Clear button resets to showing all things", async () => {
    const user = userEvent.setup();
    const things = [
      createThing({
        title: "Phone task",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
      createThing({
        title: "Computer task",
        bucket: "next",
        contexts: ["@computer"] as unknown as CanonicalId[],
      }),
    ];
    render(<ThingList {...defaultProps({ bucket: "next", things })} />);

    await user.click(screen.getByRole("checkbox", { name: /@phone/ }));
    expect(screen.queryByText("Computer task")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Clear context filters"));
    expect(screen.getByText("Phone task")).toBeInTheDocument();
    expect(screen.getByText("Computer task")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // onEdit callback forwarding
  // -------------------------------------------------------------------------

  it("passes onEdit to expanded item", async () => {
    const user = userEvent.setup();
    const things = [createThing({ title: "Edit me", bucket: "next" })];
    const onEdit = vi.fn();
    render(<ThingList {...defaultProps({ bucket: "next", things, onEdit })} />);
    await user.click(screen.getByText("Edit me"));
    await user.click(screen.getByRole("button", { name: "high" }));
    expect(onEdit).toHaveBeenCalledWith(things[0].id, {
      energyLevel: "high",
    });
  });
});
