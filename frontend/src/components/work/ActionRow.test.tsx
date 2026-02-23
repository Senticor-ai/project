import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionRow, type ActionRowProps } from "./ActionRow";
import { createActionItem } from "@/model/factories";
import { resetFactoryCounter } from "@/model/factories";
import type { CanonicalId } from "@/model/canonical-id";

// dnd-kit stub
vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
}));

function renderRow(overrides: Partial<ActionRowProps> = {}) {
  const thing = overrides.thing ?? createActionItem({ name: "Buy milk" });
  const props: ActionRowProps = {
    thing,
    onComplete: vi.fn(),
    onToggleFocus: vi.fn(),
    onMove: vi.fn(),
    onArchive: vi.fn(),
    ...overrides,
  };
  const result = render(<ActionRow {...props} />);
  return { ...result, props };
}

beforeEach(() => {
  resetFactoryCounter();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("ActionRow rendering", () => {
  it("renders title", () => {
    renderRow({ thing: createActionItem({ name: "Call dentist" }) });
    expect(screen.getByText("Call dentist")).toBeInTheDocument();
  });

  it("renders drag handle", () => {
    renderRow({ thing: createActionItem({ name: "Task" }) });
    expect(screen.getByLabelText("Drag Task")).toBeInTheDocument();
  });

  it("renders checkbox", () => {
    renderRow({ thing: createActionItem({ name: "Task" }) });
    expect(screen.getByLabelText("Complete Task")).toBeInTheDocument();
  });

  it("renders focus star", () => {
    renderRow({ thing: createActionItem({ name: "Task" }) });
    expect(screen.getByLabelText("Focus Task")).toBeInTheDocument();
  });

  it("shows strikethrough when completed", () => {
    const thing = createActionItem({
      name: "Done task",
      completedAt: new Date().toISOString(),
    });
    renderRow({ thing });
    expect(screen.getByLabelText("Completed: Done task")).toBeInTheDocument();
    expect(screen.getByText("Done task")).toHaveClass("line-through");
  });

  it("shows filled star when focused", () => {
    const thing = createActionItem({ name: "Starred", isFocused: true });
    renderRow({ thing });
    expect(screen.getByLabelText("Unfocus Starred")).toBeInTheDocument();
  });

  it("shows source subtitle for non-thought sources", () => {
    const thing = createActionItem({
      name: "Follow-up",
      captureSource: { kind: "import", source: "nirvana" },
    });
    renderRow({ thing });
    expect(screen.getByText("via import")).toBeInTheDocument();
  });

  it("does not show subtitle for thought sources", () => {
    renderRow({ thing: createActionItem({ name: "Thought" }) });
    expect(screen.queryByText(/via /)).not.toBeInTheDocument();
  });

  it("shows sender address for email items with from", () => {
    const thing = createActionItem({
      name: "Re: Antrag auf Verlangerung",
      captureSource: {
        kind: "email",
        subject: "Re: Antrag auf Verlangerung",
        from: "h.schmidt@example.de",
      },
    });
    renderRow({ thing });
    expect(screen.getByText("h.schmidt@example.de")).toBeInTheDocument();
  });

  it("falls back to 'via email' when email has no from", () => {
    const thing = createActionItem({
      name: "Some email",
      captureSource: { kind: "email", subject: "Hello" },
    });
    renderRow({ thing });
    expect(screen.getByText("via email")).toBeInTheDocument();
  });

  it("shows mail icon for email items", () => {
    const thing = createActionItem({
      name: "Email item",
      captureSource: { kind: "email", from: "test@example.com" },
    });
    renderRow({ thing });
    expect(screen.getByText("mail")).toBeInTheDocument();
  });

  it("shows note indicator when expanded and notes exist", () => {
    const thing = createActionItem({ name: "Task", description: "Some notes" });
    renderRow({
      thing,
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    expect(screen.getByLabelText("Hide notes for Task")).toBeInTheDocument();
  });

  it("hides note indicator when collapsed (notes preview shown instead)", () => {
    const thing = createActionItem({ name: "Task", description: "Some notes" });
    renderRow({ thing });
    expect(screen.queryByLabelText(/notes for Task/i)).toBeInTheDocument(); // notes preview button is visible
    expect(
      screen.queryByLabelText("Hide notes for Task"),
    ).not.toBeInTheDocument(); // but not the icon
  });

  it("hides note indicator when no notes", () => {
    renderRow({ thing: createActionItem({ name: "Task" }) });
    expect(screen.queryByLabelText(/notes for Task/i)).not.toBeInTheDocument();
  });

  it("shows due date when set", () => {
    const thing = createActionItem({
      name: "Task",
      bucket: "next",
      dueDate: "2099-12-31",
    });
    renderRow({ thing });
    expect(screen.getByText("2099-12-31")).toBeInTheDocument();
  });

  it("shows overdue styling for past due dates", () => {
    const thing = createActionItem({
      name: "Task",
      bucket: "next",
      dueDate: "2020-01-01",
    });
    renderRow({ thing });
    const dueDateEl = screen.getByText(/2020-01-01/);
    expect(dueDateEl).toHaveClass("text-status-error");
  });

  it("shows bucket badge when showBucket is true", () => {
    const thing = createActionItem({ name: "Task", bucket: "next" });
    renderRow({ thing, showBucket: true });
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("hides bucket badge by default", () => {
    const thing = createActionItem({ name: "Task", bucket: "next" });
    renderRow({ thing });
    // "Next" text should only not be in the main row (it may be in the menu)
    // Check for BucketBadge specifically — it has a specific className
    const badges = screen.queryAllByText("Next");
    // Should not have a visible badge in the row itself
    expect(badges.filter((el) => el.closest("[class*=bg-app]"))).toHaveLength(
      0,
    );
  });

  it("title button has aria-expanded when expandable", () => {
    renderRow({
      thing: createActionItem({ name: "Task" }),
      onToggleExpand: vi.fn(),
    });
    expect(screen.getByRole("button", { name: "Task" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("title button has aria-expanded=true when expanded", () => {
    renderRow({
      thing: createActionItem({ name: "Task" }),
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
    renderRow({ thing: createActionItem({ name: "Task" }) });
    expect(screen.getByRole("button", { name: "Task" })).not.toHaveAttribute(
      "aria-expanded",
    );
  });

  it("shows edit button when onToggleExpand provided", () => {
    renderRow({
      thing: createActionItem({ name: "Task" }),
      onToggleExpand: vi.fn(),
    });
    expect(screen.getByLabelText("Edit Task")).toBeInTheDocument();
  });

  it("hides edit button when onToggleExpand not provided", () => {
    renderRow({ thing: createActionItem({ name: "Task" }) });
    expect(screen.queryByLabelText("Edit Task")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Notes preview
// ---------------------------------------------------------------------------

describe("ActionRow notes preview", () => {
  it("shows notes preview when collapsed and description exists", () => {
    renderRow({
      thing: createActionItem({ name: "Task", description: "Some notes here" }),
    });
    expect(screen.getByText("Some notes here")).toBeInTheDocument();
  });

  it("hides notes preview when expanded", () => {
    renderRow({
      thing: createActionItem({ name: "Task", description: "Some notes here" }),
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
    renderRow({ thing: createActionItem({ name: "Task" }) });
    expect(screen.queryByLabelText(/Notes for/)).not.toBeInTheDocument();
  });

  it("clicking notes preview calls onToggleExpand", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createActionItem({ name: "Task", description: "Some notes here" }),
      onToggleExpand,
    });
    await user.click(screen.getByLabelText("Notes for Task"));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("applies line-clamp to long notes", () => {
    const longNotes = Array.from(
      { length: 15 },
      (_, i) => `Line ${i + 1}`,
    ).join("\n");
    renderRow({
      thing: createActionItem({ name: "Task", description: longNotes }),
    });
    const preview = screen.getByLabelText("Notes for Task");
    expect(preview).toHaveClass("line-clamp-[10]");
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe("ActionRow interactions", () => {
  it("calls onComplete when checkbox clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createActionItem({ name: "Task" }),
    });
    await user.click(screen.getByLabelText("Complete Task"));
    expect(props.onComplete).toHaveBeenCalledWith(props.thing.id);
  });

  it("calls onToggleFocus when star clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createActionItem({ name: "Task" }),
    });
    await user.click(screen.getByLabelText("Focus Task"));
    expect(props.onToggleFocus).toHaveBeenCalledWith(props.thing.id);
  });

  it("calls onToggleExpand when title clicked", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createActionItem({ name: "Task" }),
      onToggleExpand,
    });
    await user.click(screen.getByText("Task"));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("calls onToggleExpand when edit button clicked (collapsed)", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createActionItem({ name: "Task" }),
      onToggleExpand,
    });
    await user.click(screen.getByLabelText("Edit Task"));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("calls onToggleExpand when notes preview clicked", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createActionItem({ name: "Task", description: "Details" }),
      onToggleExpand,
    });
    await user.click(screen.getByLabelText("Notes for Task"));
    expect(onToggleExpand).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Move menu
// ---------------------------------------------------------------------------

describe("ActionRow move menu", () => {
  it("opens move menu on click", async () => {
    const user = userEvent.setup();
    renderRow({ thing: createActionItem({ name: "Task", bucket: "next" }) });
    await user.click(screen.getByLabelText("Move Task"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("excludes current bucket from menu", async () => {
    const user = userEvent.setup();
    renderRow({ thing: createActionItem({ name: "Task", bucket: "next" }) });
    await user.click(screen.getByLabelText("Move Task"));
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByText("Move to Next")).not.toBeInTheDocument();
    expect(within(menu).getByText("Move to Inbox")).toBeInTheDocument();
    expect(within(menu).getByText("Move to Waiting")).toBeInTheDocument();
  });

  it("calls onMove when menu item clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createActionItem({ name: "Task", bucket: "next" }),
    });
    await user.click(screen.getByLabelText("Move Task"));
    await user.click(screen.getByText("Move to Later"));
    expect(props.onMove).toHaveBeenCalledWith(props.thing.id, "someday");
  });

  it("calls onArchive from menu", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createActionItem({ name: "Task", bucket: "next" }),
    });
    await user.click(screen.getByLabelText("Move Task"));
    await user.click(screen.getByText("Archive"));
    expect(props.onArchive).toHaveBeenCalledWith(props.thing.id);
  });

  it("closes menu after selection", async () => {
    const user = userEvent.setup();
    renderRow({ thing: createActionItem({ name: "Task", bucket: "next" }) });
    await user.click(screen.getByLabelText("Move Task"));
    await user.click(screen.getByText("Move to Later"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Expanded state
// ---------------------------------------------------------------------------

describe("ActionRow expanded", () => {
  it("shows ItemEditor when expanded and onEdit provided", () => {
    renderRow({
      thing: createActionItem({ name: "Task", bucket: "next" }),
      isExpanded: true,
      onEdit: vi.fn(),
      onToggleExpand: vi.fn(),
    });
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
  });

  it("hides ItemEditor behind More options toggle for inbox items", async () => {
    const user = userEvent.setup();
    renderRow({
      thing: createActionItem({ name: "Inbox task", bucket: "inbox" }),
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
      thing: createActionItem({ name: "Task" }),
      isExpanded: false,
      onEdit: vi.fn(),
    });
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
  });

  it("shows triage buttons when expanded and bucket is inbox", () => {
    renderRow({
      thing: createActionItem({ name: "Inbox task", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
    });
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Waiting")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Calendar")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Later")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Reference")).toBeInTheDocument();
    expect(screen.getByLabelText("Archive")).toBeInTheDocument();
  });

  it("hides triage buttons for non-inbox buckets", () => {
    renderRow({
      thing: createActionItem({ name: "Action", bucket: "next" }),
      isExpanded: true,
      onEdit: vi.fn(),
      onToggleExpand: vi.fn(),
    });
    expect(screen.queryByLabelText("Move to Next")).not.toBeInTheDocument();
  });

  it("calls onMove when triage button clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createActionItem({ name: "Inbox task", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
    });
    await user.click(screen.getByLabelText("Move to Next"));
    expect(props.onMove).toHaveBeenCalledWith(
      props.thing.id,
      "next",
      undefined,
    );
  });

  it("passes projectId from editor when triage button clicked", async () => {
    const user = userEvent.setup();
    const projectId = "urn:app:project:tax-2024" as CanonicalId;
    const { props } = renderRow({
      thing: createActionItem({ name: "W-2 PDF", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
      projects: [{ id: projectId, name: "Tax 2024" }],
    });
    // Open "More options" and select the project
    await user.click(screen.getByText("More options"));
    const projectSelect = screen.getByLabelText("Assign to project");
    await user.selectOptions(projectSelect, projectId);
    // Click triage button — should pass projectId
    await user.click(screen.getByLabelText("Move to Reference"));
    expect(props.onMove).toHaveBeenCalledWith(
      props.thing.id,
      "reference",
      projectId,
    );
  });

  it("calls onArchive from triage archive button", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createActionItem({ name: "Inbox task", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
    });
    await user.click(screen.getByLabelText("Archive"));
    expect(props.onArchive).toHaveBeenCalledWith(props.thing.id);
  });
});

// ---------------------------------------------------------------------------
// Email body viewer
// ---------------------------------------------------------------------------

describe("ActionRow email body viewer", () => {
  it("shows EmailBodyViewer when expanded and item has email body", () => {
    const thing = createActionItem({
      name: "Re: Antrag",
      bucket: "next",
      captureSource: { kind: "email", from: "h.schmidt@example.de" },
      emailBody: "<p>Sehr geehrte Frau Müller</p>",
      emailSourceUrl: "https://mail.google.com/mail/u/0/#inbox/123",
    });
    renderRow({
      thing,
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    expect(
      screen.getByRole("button", { name: /E-Mail anzeigen/i }),
    ).toBeInTheDocument();
  });

  it("hides EmailBodyViewer when item is not an email", () => {
    renderRow({
      thing: createActionItem({ name: "Task", bucket: "next" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    expect(
      screen.queryByRole("button", { name: /E-Mail anzeigen/i }),
    ).not.toBeInTheDocument();
  });

  it("hides EmailBodyViewer when collapsed", () => {
    const thing = createActionItem({
      name: "Email task",
      captureSource: { kind: "email", from: "test@example.com" },
      emailBody: "<p>Body</p>",
    });
    renderRow({ thing, isExpanded: false });
    expect(
      screen.queryByRole("button", { name: /E-Mail anzeigen/i }),
    ).not.toBeInTheDocument();
  });

  it("shows EmailBodyViewer for inbox email items (above triage)", () => {
    const thing = createActionItem({
      name: "Inbox email",
      bucket: "inbox",
      captureSource: { kind: "email", from: "sender@example.de" },
      emailBody: "<p>Email content</p>",
    });
    renderRow({
      thing,
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    expect(
      screen.getByRole("button", { name: /E-Mail anzeigen/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Title editing
// ---------------------------------------------------------------------------

describe("ActionRow title collapse", () => {
  it("title is a button when expanded but not editing", () => {
    renderRow({
      thing: createActionItem({ name: "Task" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    // Title should be a button, not a textarea
    expect(screen.getByRole("button", { name: "Task" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Task")).not.toBeInTheDocument();
  });

  it("double-clicking title when expanded enters title editing", async () => {
    const user = userEvent.setup();
    renderRow({
      thing: createActionItem({ name: "Task" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
      onUpdateTitle: vi.fn(),
    });
    await user.dblClick(screen.getByRole("button", { name: "Task" }));
    expect(screen.getByDisplayValue("Task")).toBeInTheDocument();
  });

  it("clicking title when expanded collapses the row", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createActionItem({ name: "Task" }),
      isExpanded: true,
      onToggleExpand,
      onEdit: vi.fn(),
      onUpdateTitle: vi.fn(),
    });
    await user.click(screen.getByRole("button", { name: "Task" }));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("clicking collapse button when expanded calls onToggleExpand", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createActionItem({ name: "Task" }),
      isExpanded: true,
      onToggleExpand,
      onEdit: vi.fn(),
    });
    await user.click(screen.getByLabelText("Collapse Task"));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("title editing resets when row collapses", () => {
    const thing = createActionItem({ name: "Task" });
    const { rerender } = render(
      <ActionRow
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
      <ActionRow
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
      <ActionRow
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

describe("ActionRow title editing", () => {
  it("saves title on Enter", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    const thing = createActionItem({ name: "Old title" });
    renderRow({
      thing,
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onUpdateTitle,
    });

    // Double-click title to enter editing mode
    await user.dblClick(screen.getByRole("button", { name: "Old title" }));
    const textarea = screen.getByDisplayValue("Old title");
    await user.clear(textarea);
    await user.type(textarea, "New title{Enter}");
    expect(onUpdateTitle).toHaveBeenCalledWith(thing.id, "New title");
  });

  it("exits title editing on blur", async () => {
    const user = userEvent.setup();
    const thing = createActionItem({ name: "Blur test" });
    renderRow({
      thing,
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onUpdateTitle: vi.fn(),
    });
    // Double-click title to enter editing mode
    await user.dblClick(screen.getByRole("button", { name: "Blur test" }));
    expect(screen.getByDisplayValue("Blur test")).toBeInTheDocument();
    // Blur by tabbing away
    await user.tab();
    // Title should revert to a button
    expect(screen.queryByDisplayValue("Blur test")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Blur test" }),
    ).toBeInTheDocument();
  });

  it("reverts title on Escape", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    const onToggleExpand = vi.fn();
    renderRow({
      thing: createActionItem({ name: "Original" }),
      isExpanded: true,
      onToggleExpand,
      onUpdateTitle,
    });

    // Double-click title to enter editing mode
    await user.dblClick(screen.getByRole("button", { name: "Original" }));
    const textarea = screen.getByDisplayValue("Original");
    await user.clear(textarea);
    await user.type(textarea, "Changed{Escape}");
    expect(onUpdateTitle).not.toHaveBeenCalled();
  });
});

describe("ActionRow editable title split mode", () => {
  it("renders split editor in expanded non-inbox rows", () => {
    renderRow({
      thing: createActionItem({
        name: "Renamed title",
        rawCapture: "captured sentence",
        bucket: "next",
      }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
      onUpdateTitle: vi.fn(),
    });

    expect(screen.getByLabelText("Title (optional)")).toHaveValue(
      "Renamed title",
    );
    expect(screen.getByLabelText("Captured text")).toHaveTextContent(
      "captured sentence",
    );
  });

  it("calls onUpdateTitle with nameSource when split editor renames", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    const thing = createActionItem({
      name: "Old",
      rawCapture: "captured text",
      bucket: "next",
    });
    renderRow({
      thing,
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
      onUpdateTitle,
    });

    const input = screen.getByLabelText("Title (optional)");
    await user.clear(input);
    await user.type(input, "New title{Enter}");

    expect(onUpdateTitle).toHaveBeenCalledWith(
      thing.id,
      "New title",
      "user renamed in EditableTitle",
    );
  });

  it("shows split editor for inbox only after opening more options", async () => {
    const user = userEvent.setup();
    renderRow({
      thing: createActionItem({
        name: "Inbox rename",
        rawCapture: "raw inbox capture",
        bucket: "inbox",
      }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
      onUpdateTitle: vi.fn(),
    });

    expect(screen.queryByLabelText("Title (optional)")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("More options"));
    expect(screen.getByLabelText("Title (optional)")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Calendar triage date picker
// ---------------------------------------------------------------------------

describe("ActionRow calendar triage", () => {
  it("shows date picker instead of moving when Calendar clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createActionItem({ name: "Schedule me", bucket: "inbox" }),
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
    const thing = createActionItem({ name: "Schedule me", bucket: "inbox" });
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
    expect(onMove).toHaveBeenCalledWith(thing.id, "calendar", undefined);
  });

  it("dismisses date picker on Escape", async () => {
    const user = userEvent.setup();
    renderRow({
      thing: createActionItem({ name: "Schedule me", bucket: "inbox" }),
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
      thing: createActionItem({ name: "Schedule me", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    });
    await user.click(screen.getByLabelText("Move to Calendar"));
    await user.click(screen.getByLabelText("Cancel date selection"));
    expect(screen.queryByLabelText("Schedule date")).not.toBeInTheDocument();
  });

  it("resets date picker when row collapses", () => {
    const thing = createActionItem({ name: "Schedule me", bucket: "inbox" });
    const baseProps = {
      thing,
      onComplete: vi.fn(),
      onToggleFocus: vi.fn(),
      onMove: vi.fn(),
      onArchive: vi.fn(),
      onToggleExpand: vi.fn(),
      onEdit: vi.fn(),
    };
    const { rerender } = render(<ActionRow {...baseProps} isExpanded={true} />);

    // Collapse then re-expand — picker should be gone
    rerender(<ActionRow {...baseProps} isExpanded={false} />);
    rerender(<ActionRow {...baseProps} isExpanded={true} />);
    expect(screen.queryByLabelText("Schedule date")).not.toBeInTheDocument();
  });

  it("other triage buttons still move immediately", async () => {
    const user = userEvent.setup();
    const { props } = renderRow({
      thing: createActionItem({ name: "Quick triage", bucket: "inbox" }),
      isExpanded: true,
      onToggleExpand: vi.fn(),
    });
    await user.click(screen.getByLabelText("Move to Next"));
    expect(props.onMove).toHaveBeenCalledWith(
      props.thing.id,
      "next",
      undefined,
    );
  });
});

describe("ReadAction indicator", () => {
  it("shows Read subtitle for items with objectRef", () => {
    renderRow({
      thing: createActionItem({
        name: "Report.pdf",
        bucket: "next",
        objectRef: "urn:app:reference:doc-1" as CanonicalId,
        captureSource: {
          kind: "file",
          fileName: "Report.pdf",
          mimeType: "application/pdf",
        },
      }),
    });
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  it("does not show Read subtitle for regular actions", () => {
    renderRow({
      thing: createActionItem({ name: "Buy milk", bucket: "next" }),
    });
    expect(screen.queryByText("Read")).not.toBeInTheDocument();
  });

  it("renders Read subtitle as a button when onNavigateToReference is provided", () => {
    renderRow({
      thing: createActionItem({
        name: "Report.pdf",
        bucket: "next",
        objectRef: "urn:app:reference:doc-1" as CanonicalId,
        captureSource: {
          kind: "file",
          fileName: "Report.pdf",
          mimeType: "application/pdf",
        },
      }),
      onNavigateToReference: vi.fn(),
    });
    const btn = screen.getByLabelText("Go to reference");
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("calls onNavigateToReference with objectRef when clicked", async () => {
    const user = userEvent.setup();
    const onNavigateToReference = vi.fn();
    const refId = "urn:app:reference:doc-1" as CanonicalId;
    renderRow({
      thing: createActionItem({
        name: "Report.pdf",
        bucket: "next",
        objectRef: refId,
        captureSource: {
          kind: "file",
          fileName: "Report.pdf",
          mimeType: "application/pdf",
        },
      }),
      onNavigateToReference,
    });
    await user.click(screen.getByLabelText("Go to reference"));
    expect(onNavigateToReference).toHaveBeenCalledWith(refId);
  });

  it("renders Read subtitle as non-clickable span when onNavigateToReference is absent", () => {
    renderRow({
      thing: createActionItem({
        name: "Report.pdf",
        bucket: "next",
        objectRef: "urn:app:reference:doc-1" as CanonicalId,
        captureSource: {
          kind: "file",
          fileName: "Report.pdf",
          mimeType: "application/pdf",
        },
      }),
    });
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.queryByLabelText("Go to reference")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tag chips
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Move to project (overflow menu)
// ---------------------------------------------------------------------------

describe("ActionRow move to project", () => {
  it("shows project options in menu when onEdit and projects provided", async () => {
    const user = userEvent.setup();
    renderRow({
      thing: createActionItem({ name: "Task", bucket: "next" }),
      onEdit: vi.fn(),
      projects: [
        { id: "urn:app:project:p1" as CanonicalId, name: "Project Alpha" },
        { id: "urn:app:project:p2" as CanonicalId, name: "Project Beta" },
      ],
    });
    await user.click(screen.getByLabelText("Move Task"));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("Project Alpha")).toBeInTheDocument();
    expect(within(menu).getByText("Project Beta")).toBeInTheDocument();
  });

  it("hides project options when onEdit is not provided", async () => {
    const user = userEvent.setup();
    renderRow({
      thing: createActionItem({ name: "Task", bucket: "next" }),
      projects: [
        { id: "urn:app:project:p1" as CanonicalId, name: "Project Alpha" },
      ],
    });
    await user.click(screen.getByLabelText("Move Task"));
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByText("Project Alpha")).not.toBeInTheDocument();
  });

  it("excludes current project from menu", async () => {
    const user = userEvent.setup();
    const currentProjectId = "urn:app:project:p1" as CanonicalId;
    renderRow({
      thing: createActionItem({
        name: "Task",
        bucket: "next",
        projectId: currentProjectId,
      }),
      onEdit: vi.fn(),
      projects: [
        { id: currentProjectId, name: "Current Project" },
        { id: "urn:app:project:p2" as CanonicalId, name: "Other Project" },
      ],
    });
    await user.click(screen.getByLabelText("Move Task"));
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByText("Current Project")).not.toBeInTheDocument();
    expect(within(menu).getByText("Other Project")).toBeInTheDocument();
  });

  it("calls onEdit with new projectId when project clicked", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const targetProjectId = "urn:app:project:p2" as CanonicalId;
    const { props } = renderRow({
      thing: createActionItem({ name: "Task", bucket: "next" }),
      onEdit,
      projects: [{ id: targetProjectId, name: "Target Project" }],
    });
    await user.click(screen.getByLabelText("Move Task"));
    await user.click(screen.getByText("Target Project"));
    expect(onEdit).toHaveBeenCalledWith(props.thing.id, {
      projectId: targetProjectId,
    });
  });

  it("closes menu after project selection", async () => {
    const user = userEvent.setup();
    renderRow({
      thing: createActionItem({ name: "Task", bucket: "next" }),
      onEdit: vi.fn(),
      projects: [
        { id: "urn:app:project:p1" as CanonicalId, name: "Project Alpha" },
      ],
    });
    await user.click(screen.getByLabelText("Move Task"));
    await user.click(screen.getByText("Project Alpha"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("ActionRow project badge", () => {
  it("shows project badge when projects prop and projectId are set", () => {
    renderRow({
      thing: createActionItem({
        name: "Task",
        bucket: "next",
        projectId: "urn:app:project:p1" as CanonicalId,
      }),
      projects: [{ id: "urn:app:project:p1" as CanonicalId, name: "Tax 2024" }],
    });
    expect(screen.getByText("Tax 2024")).toBeInTheDocument();
    expect(screen.getByText("folder")).toBeInTheDocument();
  });

  it("hides project badge when projects prop is not provided", () => {
    renderRow({
      thing: createActionItem({
        name: "Task",
        bucket: "next",
        projectId: "urn:app:project:p1" as CanonicalId,
      }),
    });
    expect(screen.queryByText("folder")).not.toBeInTheDocument();
  });

  it("hides project badge when item has no projectId", () => {
    renderRow({
      thing: createActionItem({ name: "Task", bucket: "next" }),
      projects: [{ id: "urn:app:project:p1" as CanonicalId, name: "Tax 2024" }],
    });
    // "Tax 2024" should not appear as a badge in the row
    // (it may be in the overflow menu, so check for the folder icon instead)
    const badges = screen.queryAllByText("Tax 2024");
    const inBadge = badges.filter((el) =>
      el.closest("[class*=bg-app-project]"),
    );
    expect(inBadge).toHaveLength(0);
  });
});

describe("ActionRow tag chips", () => {
  it("shows tag chips on collapsed row when tags exist", () => {
    renderRow({
      thing: createActionItem({
        name: "Tagged task",
        bucket: "next",
        tags: ["1099-int", "schedule-b"],
      }),
    });
    expect(screen.getByText("1099-int")).toBeInTheDocument();
    expect(screen.getByText("schedule-b")).toBeInTheDocument();
  });

  it("does not show tag chips when tags array is empty", () => {
    renderRow({
      thing: createActionItem({ name: "No tags", bucket: "next", tags: [] }),
    });
    expect(screen.queryByText("1099-int")).not.toBeInTheDocument();
  });
});
