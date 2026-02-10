import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThingRow, type ThingRowProps } from "./ThingRow";
import { createThing } from "@/model/factories";
import { resetFactoryCounter } from "@/model/factories";

// dnd-kit stub
vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
}));

function renderRow(overrides: Partial<ThingRowProps> = {}) {
  const thing = overrides.thing ?? createThing({ name: "Buy milk" });
  const props: ThingRowProps = {
    thing,
    onComplete: vi.fn(),
    onToggleFocus: vi.fn(),
    onMove: vi.fn(),
    onArchive: vi.fn(),
    ...overrides,
  };
  const result = render(<ThingRow {...props} />);
  return { ...result, props };
}

beforeEach(() => {
  resetFactoryCounter();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("ThingRow rendering", () => {
  it("renders title", () => {
    renderRow({ thing: createThing({ name: "Call dentist" }) });
    expect(screen.getByText("Call dentist")).toBeInTheDocument();
  });

  it("renders drag handle", () => {
    renderRow({ thing: createThing({ name: "Task" }) });
    expect(screen.getByLabelText("Drag Task")).toBeInTheDocument();
  });

  it("renders checkbox", () => {
    renderRow({ thing: createThing({ name: "Task" }) });
    expect(screen.getByLabelText("Complete Task")).toBeInTheDocument();
  });

  it("renders focus star", () => {
    renderRow({ thing: createThing({ name: "Task" }) });
    expect(screen.getByLabelText("Focus Task")).toBeInTheDocument();
  });

  it("shows strikethrough when completed", () => {
    const thing = createThing({
      name: "Done task",
      completedAt: new Date().toISOString(),
    });
    renderRow({ thing });
    expect(screen.getByLabelText("Completed: Done task")).toBeInTheDocument();
    expect(screen.getByText("Done task")).toHaveClass("line-through");
  });

  it("shows filled star when focused", () => {
    const thing = createThing({ name: "Starred", isFocused: true });
    renderRow({ thing });
    expect(screen.getByLabelText("Unfocus Starred")).toBeInTheDocument();
  });

  it("shows source subtitle for non-thought sources", () => {
    const thing = createThing({
      name: "Follow-up",
      captureSource: { kind: "email", subject: "Re: meeting" },
    });
    renderRow({ thing });
    expect(screen.getByText("via email")).toBeInTheDocument();
  });

  it("does not show subtitle for thought sources", () => {
    renderRow({ thing: createThing({ name: "Thought" }) });
    expect(screen.queryByText(/via /)).not.toBeInTheDocument();
  });

  it("shows note indicator when expanded and notes exist", () => {
    const thing = createThing({ name: "Task", description: "Some notes" });
    renderRow({ thing, isExpanded: true, onToggleExpand: vi.fn(), onEdit: vi.fn() });
    expect(screen.getByLabelText("Hide notes for Task")).toBeInTheDocument();
  });

  it("hides note indicator when collapsed (notes preview shown instead)", () => {
    const thing = createThing({ name: "Task", description: "Some notes" });
    renderRow({ thing });
    expect(
      screen.queryByLabelText(/notes for Task/i),
    ).toBeInTheDocument(); // notes preview button is visible
    expect(
      screen.queryByLabelText("Hide notes for Task"),
    ).not.toBeInTheDocument(); // but not the icon
  });

  it("hides note indicator when no notes", () => {
    renderRow({ thing: createThing({ name: "Task" }) });
    expect(
      screen.queryByLabelText(/notes for Task/i),
    ).not.toBeInTheDocument();
  });

  it("shows due date when set", () => {
    const thing = createThing({
      name: "Task",
      bucket: "next",
      dueDate: "2099-12-31",
    });
    renderRow({ thing });
    expect(screen.getByText("2099-12-31")).toBeInTheDocument();
  });

  it("shows overdue styling for past due dates", () => {
    const thing = createThing({
      name: "Task",
      bucket: "next",
      dueDate: "2020-01-01",
    });
    renderRow({ thing });
    const dueDateEl = screen.getByText(/2020-01-01/);
    expect(dueDateEl).toHaveClass("text-red-600");
  });

  it("shows bucket badge when showBucket is true", () => {
    const thing = createThing({ name: "Task", bucket: "next" });
    renderRow({ thing, showBucket: true });
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("hides bucket badge by default", () => {
    const thing = createThing({ name: "Task", bucket: "next" });
    renderRow({ thing });
    // "Next" text should only not be in the main row (it may be in the menu)
    // Check for BucketBadge specifically — it has a specific className
    const badges = screen.queryAllByText("Next");
    // Should not have a visible badge in the row itself
    expect(badges.filter((el) => el.closest("[class*=bg-gtd]"))).toHaveLength(
      0,
    );
  });

  it("title button has aria-expanded when expandable", () => {
    renderRow({
      thing: createThing({ name: "Task" }),
      onToggleExpand: vi.fn(),
    });
    expect(screen.getByRole("button", { name: "Task" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("title button has aria-expanded=true when expanded", () => {
    renderRow({
      thing: createThing({ name: "Task" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    expect(screen.getByRole("button", { name: "Task" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("title button omits aria-expanded when not expandable", () => {
    renderRow({ thing: createThing({ name: "Task" }) });
    expect(screen.getByRole("button", { name: "Task" })).not.toHaveAttribute(
      "aria-expanded",
    );
  });

  it("shows edit button when onToggleExpand provided", () => {
    renderRow({
      thing: createThing({ name: "Task" }),
      onToggleExpand: vi.fn(),
    });
    expect(screen.getByLabelText("Edit Task")).toBeInTheDocument();
  });

  it("hides edit button when onToggleExpand not provided", () => {
    renderRow({ thing: createThing({ name: "Task" }) });
    expect(screen.queryByLabelText("Edit Task")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Notes preview
// ---------------------------------------------------------------------------

describe("ThingRow notes preview", () => {
  it("shows notes preview when collapsed and description exists", () => {
    renderRow({
      thing: createThing({ name: "Task", description: "Some notes here" }),
    });
    expect(screen.getByText("Some notes here")).toBeInTheDocument();
  });

  it("hides notes preview when expanded", () => {
    renderRow({
      thing: createThing({ name: "Task", description: "Some notes here" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    // The description text should not appear as a preview paragraph
    // (ItemEditor has its own notes textarea, but that shows "Add notes..." placeholder)
    const previewEl = screen.queryByLabelText("Notes for Task");
    expect(previewEl).not.toBeInTheDocument();
  });

  it("hides notes preview when no description", () => {
    renderRow({ thing: createThing({ name: "Task" }) });
    expect(screen.queryByLabelText(/Notes for/)).not.toBeInTheDocument();
  });

  it("clicking notes preview calls onToggleExpand", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createThing({ name: "Task", description: "Some notes here" }),
      onToggleExpand,
    });
    await user.click(screen.getByLabelText("Notes for Task"));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("applies line-clamp to long notes", () => {
    const longNotes = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}`).join("\n");
    renderRow({
      thing: createThing({ name: "Task", description: longNotes }),
    });
    const preview = screen.getByLabelText("Notes for Task");
    expect(preview).toHaveClass("line-clamp-[10]");
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe("ThingRow interactions", () => {
  it("calls onComplete when checkbox clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createThing({ name: "Task" }),
    });
    await user.click(screen.getByLabelText("Complete Task"));
    expect(props.onComplete).toHaveBeenCalledWith(props.thing.id);
  });

  it("calls onToggleFocus when star clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createThing({ name: "Task" }),
    });
    await user.click(screen.getByLabelText("Focus Task"));
    expect(props.onToggleFocus).toHaveBeenCalledWith(props.thing.id);
  });

  it("calls onToggleExpand when title clicked", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createThing({ name: "Task" }),
      onToggleExpand,
    });
    await user.click(screen.getByText("Task"));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("calls onToggleExpand when edit button clicked (collapsed)", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createThing({ name: "Task" }),
      onToggleExpand,
    });
    await user.click(screen.getByLabelText("Edit Task"));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("calls onToggleExpand when notes preview clicked", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createThing({ name: "Task", description: "Details" }),
      onToggleExpand,
    });
    await user.click(screen.getByLabelText("Notes for Task"));
    expect(onToggleExpand).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Move menu
// ---------------------------------------------------------------------------

describe("ThingRow move menu", () => {
  it("opens move menu on click", async () => {
    const user = userEvent.setup();
    renderRow({ thing: createThing({ name: "Task", bucket: "next" }) });
    await user.click(screen.getByLabelText("Move Task"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("excludes current bucket from menu", async () => {
    const user = userEvent.setup();
    renderRow({ thing: createThing({ name: "Task", bucket: "next" }) });
    await user.click(screen.getByLabelText("Move Task"));
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByText("Move to Next")).not.toBeInTheDocument();
    expect(within(menu).getByText("Move to Inbox")).toBeInTheDocument();
    expect(within(menu).getByText("Move to Waiting")).toBeInTheDocument();
  });

  it("calls onMove when menu item clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createThing({ name: "Task", bucket: "next" }),
    });
    await user.click(screen.getByLabelText("Move Task"));
    await user.click(screen.getByText("Move to Someday"));
    expect(props.onMove).toHaveBeenCalledWith(props.thing.id, "someday");
  });

  it("calls onArchive from menu", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createThing({ name: "Task", bucket: "next" }),
    });
    await user.click(screen.getByLabelText("Move Task"));
    await user.click(screen.getByText("Archive"));
    expect(props.onArchive).toHaveBeenCalledWith(props.thing.id);
  });

  it("closes menu after selection", async () => {
    const user = userEvent.setup();
    renderRow({ thing: createThing({ name: "Task", bucket: "next" }) });
    await user.click(screen.getByLabelText("Move Task"));
    await user.click(screen.getByText("Move to Someday"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Expanded state
// ---------------------------------------------------------------------------

describe("ThingRow expanded", () => {
  it("shows ItemEditor when expanded and onEdit provided", () => {
    renderRow({
      thing: createThing({ name: "Task", bucket: "next" }),
      isExpanded: true,
      onEdit: vi.fn(),
      onToggleExpand: vi.fn(),
    });
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
  });

  it("hides ItemEditor behind More options toggle for inbox items", async () => {
    const user = userEvent.setup();
    renderRow({
      thing: createThing({ name: "Inbox task", bucket: "inbox" }),
      isExpanded: true,
      onEdit: vi.fn(),
      onToggleExpand: vi.fn(),
    });
    // ItemEditor not visible by default for inbox
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
    expect(screen.getByText("More options")).toBeInTheDocument();
    // Click "More options" to reveal editor
    await user.click(screen.getByText("More options"));
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Less options")).toBeInTheDocument();
  });

  it("hides ItemEditor when collapsed", () => {
    renderRow({
      thing: createThing({ name: "Task" }),
      isExpanded: false,
      onEdit: vi.fn(),
    });
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
  });

  it("shows triage buttons when expanded and bucket is inbox", () => {
    renderRow({
      thing: createThing({ name: "Inbox task", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
    });
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Waiting")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Calendar")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Someday")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Reference")).toBeInTheDocument();
    expect(screen.getByLabelText("Archive")).toBeInTheDocument();
  });

  it("hides triage buttons for non-inbox buckets", () => {
    renderRow({
      thing: createThing({ name: "Action", bucket: "next" }),
      isExpanded: true,
      onEdit: vi.fn(),
      onToggleExpand: vi.fn(),
    });
    expect(screen.queryByLabelText("Move to Next")).not.toBeInTheDocument();
  });

  it("calls onMove when triage button clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createThing({ name: "Inbox task", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
    });
    await user.click(screen.getByLabelText("Move to Next"));
    expect(props.onMove).toHaveBeenCalledWith(props.thing.id, "next");
  });

  it("calls onArchive from triage archive button", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createThing({ name: "Inbox task", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
    });
    await user.click(screen.getByLabelText("Archive"));
    expect(props.onArchive).toHaveBeenCalledWith(props.thing.id);
  });
});

// ---------------------------------------------------------------------------
// Title editing
// ---------------------------------------------------------------------------

describe("ThingRow title collapse", () => {
  it("title is a button when expanded but not editing", () => {
    renderRow({
      thing: createThing({ name: "Task" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    // Title should be a button, not a textarea
    expect(screen.getByRole("button", { name: "Task" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Task")).not.toBeInTheDocument();
  });

  it("clicking title when expanded enters title editing", async () => {
    const user = userEvent.setup();
    renderRow({
      thing: createThing({ name: "Task" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
      onUpdateTitle: vi.fn(),
    });
    await user.click(screen.getByRole("button", { name: "Task" }));
    expect(screen.getByDisplayValue("Task")).toBeInTheDocument();
  });

  it("clicking collapse button when expanded calls onToggleExpand", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createThing({ name: "Task" }),
      isExpanded: true,
      onToggleExpand,
      onEdit: vi.fn(),
    });
    await user.click(screen.getByLabelText("Collapse Task"));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("title editing resets when row collapses", () => {
    const thing = createThing({ name: "Task" });
    const { rerender } = render(
      <ThingRow
        thing={thing}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onArchive={vi.fn()}
        isExpanded={true}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
        onUpdateTitle={vi.fn()}
      />,
    );
    // Re-render collapsed then expanded again
    rerender(
      <ThingRow
        thing={thing}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onArchive={vi.fn()}
        isExpanded={false}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
        onUpdateTitle={vi.fn()}
      />,
    );
    rerender(
      <ThingRow
        thing={thing}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onArchive={vi.fn()}
        isExpanded={true}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
        onUpdateTitle={vi.fn()}
      />,
    );
    // Title should be a button (not editing), not a textarea
    expect(screen.getByRole("button", { name: "Task" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Task")).not.toBeInTheDocument();
  });
});

describe("ThingRow title editing", () => {
  it("saves title on Enter", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    const thing = createThing({ name: "Old title" });
    renderRow({
      thing,
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onUpdateTitle,
    });

    // Click title to enter editing mode
    await user.click(screen.getByRole("button", { name: "Old title" }));
    const textarea = screen.getByDisplayValue("Old title");
    await user.clear(textarea);
    await user.type(textarea, "New title{Enter}");
    expect(onUpdateTitle).toHaveBeenCalledWith(thing.id, "New title");
  });

  it("exits title editing on blur", async () => {
    const user = userEvent.setup();
    const thing = createThing({ name: "Blur test" });
    renderRow({
      thing,
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onUpdateTitle: vi.fn(),
    });
    // Click title to enter editing mode
    await user.click(screen.getByRole("button", { name: "Blur test" }));
    expect(screen.getByDisplayValue("Blur test")).toBeInTheDocument();
    // Blur by tabbing away
    await user.tab();
    // Title should revert to a button
    expect(screen.queryByDisplayValue("Blur test")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Blur test" })).toBeInTheDocument();
  });

  it("reverts title on Escape", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createThing({ name: "Original" }),
      isExpanded: true,
      onToggleExpand,
      onUpdateTitle,
    });

    // Click title to enter editing mode
    await user.click(screen.getByRole("button", { name: "Original" }));
    const textarea = screen.getByDisplayValue("Original");
    await user.clear(textarea);
    await user.type(textarea, "Changed{Escape}");
    expect(onUpdateTitle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Calendar triage date picker
// ---------------------------------------------------------------------------

describe("ThingRow calendar triage", () => {
  it("shows date picker instead of moving when Calendar clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createThing({ name: "Schedule me", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    await user.click(screen.getByLabelText("Move to Calendar"));
    // Date picker appears, item not moved yet
    expect(screen.getByLabelText("Schedule date")).toBeInTheDocument();
    expect(props.onMove).not.toHaveBeenCalled();
  });

  it("moves to calendar after date selection", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onMove = vi.fn();
    const thing = createThing({ name: "Schedule me", bucket: "inbox" });
    renderRow({
      thing,
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit,
      onMove,
    });
    await user.click(screen.getByLabelText("Move to Calendar"));
    const dateInput = screen.getByLabelText("Schedule date");
    // fireEvent.change is more reliable for date inputs
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(dateInput, { target: { value: "2026-03-15" } });
    expect(onEdit).toHaveBeenCalledWith(thing.id, {
      scheduledDate: "2026-03-15",
    });
    expect(onMove).toHaveBeenCalledWith(thing.id, "calendar");
  });

  it("dismisses date picker on Escape", async () => {
    const user = userEvent.setup();
    renderRow({
      thing: createThing({ name: "Schedule me", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    await user.click(screen.getByLabelText("Move to Calendar"));
    expect(screen.getByLabelText("Schedule date")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Schedule date")).not.toBeInTheDocument();
  });

  it("dismisses date picker on Cancel click", async () => {
    const user = userEvent.setup();
    renderRow({
      thing: createThing({ name: "Schedule me", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    await user.click(screen.getByLabelText("Move to Calendar"));
    await user.click(screen.getByLabelText("Cancel date selection"));
    expect(screen.queryByLabelText("Schedule date")).not.toBeInTheDocument();
  });

  it("resets date picker when row collapses", () => {
    const thing = createThing({ name: "Schedule me", bucket: "inbox" });
    const baseProps = {
      thing,
      onComplete: vi.fn(),
      onToggleFocus: vi.fn(),
      onMove: vi.fn(),
      onArchive: vi.fn(),
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    };
    const { rerender } = render(<ThingRow {...baseProps} isExpanded={true} />);

    // Collapse then re-expand — picker should be gone
    rerender(<ThingRow {...baseProps} isExpanded={false} />);
    rerender(<ThingRow {...baseProps} isExpanded={true} />);
    expect(screen.queryByLabelText("Schedule date")).not.toBeInTheDocument();
  });

  it("other triage buttons still move immediately", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createThing({ name: "Quick triage", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
    });
    await user.click(screen.getByLabelText("Move to Next"));
    expect(props.onMove).toHaveBeenCalledWith(props.thing.id, "next");
  });
});
