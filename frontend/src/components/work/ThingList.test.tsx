import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

// Mock completed items hook — returns _completedData when enabled
import type { Thing } from "@/model/types";
let _completedData: Thing[] = [];
vi.mock("@/hooks/use-things", () => ({
  useAllCompletedThings: (enabled: boolean) => ({
    data: enabled ? _completedData : [],
    isFetching: false,
  }),
}));

beforeEach(() => {
  resetFactoryCounter();
  _completedData = [];
});

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

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

function renderThingList(
  overrides: Partial<Parameters<typeof ThingList>[0]> = {},
) {
  return render(<ThingList {...defaultProps(overrides)} />, {
    wrapper: createWrapper(),
  });
}

describe("ThingList", () => {
  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  it("renders bucket header for inbox", () => {
    renderThingList({ bucket: "inbox" });
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Capture and clarify")).toBeInTheDocument();
  });

  it("renders bucket header for next", () => {
    renderThingList({ bucket: "next" });
    expect(screen.getByText("Next Actions")).toBeInTheDocument();
    expect(screen.getByText("To-do's for anytime")).toBeInTheDocument();
  });

  it("renders bucket header for focus", () => {
    renderThingList({ bucket: "focus" });
    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("Starred actions")).toBeInTheDocument();
  });

  it("renders bucket header for waiting", () => {
    renderThingList({ bucket: "waiting" });
    expect(screen.getByText("Waiting For")).toBeInTheDocument();
  });

  it("renders bucket header for calendar", () => {
    renderThingList({ bucket: "calendar" });
    expect(screen.getByText("Calendar")).toBeInTheDocument();
  });

  it("renders bucket header for someday", () => {
    renderThingList({ bucket: "someday" });
    expect(screen.getByText("Someday / Maybe")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Empty states
  // -------------------------------------------------------------------------

  it("shows empty state for inbox", () => {
    renderThingList({ bucket: "inbox" });
    expect(screen.getByText("Inbox is empty")).toBeInTheDocument();
    expect(
      screen.getByText("Capture a thought to get started"),
    ).toBeInTheDocument();
  });

  it("shows empty state for next actions", () => {
    renderThingList({ bucket: "next" });
    expect(screen.getByText("No actions here yet")).toBeInTheDocument();
  });

  it("shows empty state for focus", () => {
    renderThingList({ bucket: "focus" });
    expect(screen.getByText("No focused actions")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Filtering by bucket
  // -------------------------------------------------------------------------

  it("filters things by bucket", () => {
    const things = [
      createThing({ name: "Next task", bucket: "next" }),
      createThing({ name: "Inbox task", bucket: "inbox" }),
      createThing({ name: "Someday task", bucket: "someday" }),
    ];
    renderThingList({ bucket: "next", things });
    expect(screen.getByText("Next task")).toBeInTheDocument();
    expect(screen.queryByText("Inbox task")).not.toBeInTheDocument();
    expect(screen.queryByText("Someday task")).not.toBeInTheDocument();
  });

  it("shows focused things in focus view regardless of bucket", () => {
    const things = [
      createThing({
        name: "Focused next",
        bucket: "next",
        isFocused: true,
      }),
      createThing({
        name: "Focused waiting",
        bucket: "waiting",
        isFocused: true,
      }),
      createThing({ name: "Unfocused next", bucket: "next" }),
    ];
    renderThingList({ bucket: "focus", things });
    expect(screen.getByText("Focused next")).toBeInTheDocument();
    expect(screen.getByText("Focused waiting")).toBeInTheDocument();
    expect(screen.queryByText("Unfocused next")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Completed items (lazy-loaded via useAllCompletedThings hook)
  // -------------------------------------------------------------------------

  it("always shows completed toggle button", () => {
    const things = [createThing({ name: "Active", bucket: "next" })];
    renderThingList({ bucket: "next", things });
    expect(screen.getByLabelText("Show completed")).toBeInTheDocument();
  });

  it(
    "shows completed items after toggle click",
    { timeout: 15_000 },
    async () => {
      const user = userEvent.setup();
      _completedData = [
        createThing({
          name: "Done task A",
          bucket: "next",
          completedAt: "2026-01-20T10:00:00Z",
        }),
        createThing({
          name: "Done task B",
          bucket: "next",
          completedAt: "2026-01-18T10:00:00Z",
        }),
      ];
      const things = [createThing({ name: "Active task", bucket: "next" })];
      renderThingList({ bucket: "next", things });

      expect(screen.queryByText("Done task A")).not.toBeInTheDocument();
      await user.click(screen.getByLabelText("Show completed"));

      expect(screen.getByText("Done task A")).toBeInTheDocument();
      expect(screen.getByText("Done task B")).toBeInTheDocument();
      expect(screen.getByText("2 completed")).toBeInTheDocument();
      expect(screen.getByText("(+2 done)")).toBeInTheDocument();
    },
  );

  it("hides completed items after toggling off", async () => {
    const user = userEvent.setup();
    _completedData = [
      createThing({
        name: "Done",
        bucket: "next",
        completedAt: "2026-01-20T10:00:00Z",
      }),
    ];
    const things = [createThing({ name: "Active", bucket: "next" })];
    renderThingList({ bucket: "next", things });

    await user.click(screen.getByLabelText("Show completed"));
    expect(screen.getByText("Done")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Hide completed"));
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("completed section appears below active items", async () => {
    const user = userEvent.setup();
    _completedData = [
      createThing({
        name: "Done item",
        bucket: "next",
        completedAt: "2026-01-20T10:00:00Z",
      }),
    ];
    const things = [createThing({ name: "Active item", bucket: "next" })];
    renderThingList({ bucket: "next", things });

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
      createThing({ name: "Task A", bucket: "next" }),
      createThing({ name: "Task B", bucket: "next" }),
    ];
    renderThingList({ bucket: "next", things });
    expect(screen.getByText("2 actions")).toBeInTheDocument();
  });

  it("shows item count for inbox", () => {
    const things = [
      createThing({ name: "Thought A", bucket: "inbox" }),
      createThing({ name: "Thought B", bucket: "inbox" }),
      createThing({ name: "Thought C", bucket: "inbox" }),
    ];
    renderThingList({ bucket: "inbox", things });
    expect(screen.getByText("3 items to process")).toBeInTheDocument();
  });

  it("uses singular 'action' for single item", () => {
    const things = [createThing({ name: "Solo", bucket: "next" })];
    renderThingList({ bucket: "next", things });
    expect(screen.getByText("1 action")).toBeInTheDocument();
  });

  it("uses singular 'item' for single inbox item", () => {
    const things = [createThing({ name: "Solo", bucket: "inbox" })];
    renderThingList({ bucket: "inbox", things });
    expect(screen.getByText("1 item to process")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Rapid entry / capture
  // -------------------------------------------------------------------------

  it("shows capture input for inbox", () => {
    renderThingList({ bucket: "inbox" });
    expect(screen.getByLabelText("Capture a thought")).toBeInTheDocument();
  });

  it("shows rapid entry for action buckets", () => {
    renderThingList({ bucket: "next" });
    expect(screen.getByLabelText("Rapid entry")).toBeInTheDocument();
  });

  it("hides rapid entry in focus view", () => {
    renderThingList({ bucket: "focus" });
    expect(screen.queryByLabelText("Rapid entry")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Capture a thought"),
    ).not.toBeInTheDocument();
  });

  it("calls onAdd via rapid entry", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderThingList({ bucket: "next", onAdd });
    const input = screen.getByLabelText("Rapid entry");
    await user.type(input, "New task{Enter}");
    expect(onAdd).toHaveBeenCalledWith("New task");
  });

  it("calls onAdd via inbox capture", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderThingList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "New thought{Enter}");
    expect(onAdd).toHaveBeenCalledWith("New thought");
  });

  it("does not call onAdd for empty input", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderThingList({ bucket: "next", onAdd });
    const input = screen.getByLabelText("Rapid entry");
    await user.type(input, "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("clears input optimistically even when onAdd rejects", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error("Network error"));
    renderThingList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "Buy groceries{Enter}");
    // Input is cleared optimistically — not restored on error
    expect(input).toHaveValue("");
  });

  it("clears input text when onAdd resolves", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    renderThingList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "Buy groceries{Enter}");
    expect(input).toHaveValue("");
  });

  it("shows error message when onAdd rejects", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error("Network error"));
    renderThingList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "Buy groceries{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(/failed/i);
  });

  it("does not disable input while onAdd is pending", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(
      () => new Promise<void>(() => {}), // never resolves
    );
    renderThingList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "Buy groceries{Enter}");
    // Input should NOT be disabled — optimistic clearing
    expect(input).not.toBeDisabled();
    expect(input).toHaveValue("");
  });

  it("allows immediate second entry while first is pending", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(
      () => new Promise<void>(() => {}), // never resolves
    );
    renderThingList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "First{Enter}");
    await user.type(input, "Second{Enter}");
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd).toHaveBeenCalledWith("First");
    expect(onAdd).toHaveBeenCalledWith("Second");
  });

  it("preserves newlines in captured text via Shift+Enter", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderThingList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "line1{Shift>}{Enter}{/Shift}line2{Enter}");
    expect(onAdd).toHaveBeenCalledTimes(1);
    const captured = onAdd.mock.calls[0][0] as string;
    expect(captured).toContain("line1");
    expect(captured).toContain("line2");
    expect(captured).toContain("\n");
  });

  it("resets textarea height after multiline submit", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderThingList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText(
      "Capture a thought",
    ) as HTMLTextAreaElement;
    await user.type(input, "line1{Shift>}{Enter}{/Shift}line2{Enter}");
    expect(input.style.height).toBe("auto");
  });

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------

  it("sorts inbox items newest first", () => {
    const things = [
      createThing({
        name: "Newer",
        bucket: "inbox",
        provenance: {
          createdAt: "2026-02-05T10:00:00Z",
          updatedAt: "2026-02-05T10:00:00Z",
          history: [],
        },
      }),
      createThing({
        name: "Older",
        bucket: "inbox",
        provenance: {
          createdAt: "2026-02-01T10:00:00Z",
          updatedAt: "2026-02-01T10:00:00Z",
          history: [],
        },
      }),
    ];
    renderThingList({ bucket: "inbox", things });

    const older = screen.getByText("Older");
    const newer = screen.getByText("Newer");
    expect(
      newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("sorts actions newest first (no sequenceOrder)", () => {
    const things = [
      createThing({
        name: "Older action",
        bucket: "next",
        provenance: {
          createdAt: "2026-01-10T10:00:00Z",
          updatedAt: "2026-01-10T10:00:00Z",
          history: [],
        },
      }),
      createThing({
        name: "Newer action",
        bucket: "next",
        provenance: {
          createdAt: "2026-02-05T10:00:00Z",
          updatedAt: "2026-02-05T10:00:00Z",
          history: [],
        },
      }),
    ];
    renderThingList({ bucket: "next", things });

    const newer = screen.getByText("Newer action");
    const older = screen.getByText("Older action");
    expect(
      newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("sorts focused actions first in action buckets", () => {
    const things = [
      createThing({ name: "Unfocused first", bucket: "next" }),
      createThing({
        name: "Focused second",
        bucket: "next",
        isFocused: true,
      }),
    ];
    renderThingList({ bucket: "next", things });

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
    const things = [createThing({ name: "Editable item", bucket: "next" })];
    renderThingList({ bucket: "next", things, onEdit: vi.fn() });
    await user.click(screen.getByText("Editable item"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();
  });

  it("only expands one item at a time", async () => {
    const user = userEvent.setup();
    const things = [
      createThing({ name: "First item", bucket: "next" }),
      createThing({ name: "Second item", bucket: "next" }),
    ];
    renderThingList({ bucket: "next", things, onEdit: vi.fn() });
    await user.click(screen.getByText("First item"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();

    await user.click(screen.getByText("Second item"));
    expect(screen.getAllByText("Complexity")).toHaveLength(1);
  });

  it("does not expand when no onEdit or onUpdateTitle", async () => {
    const user = userEvent.setup();
    const things = [createThing({ name: "Static item", bucket: "next" })];
    renderThingList({ bucket: "next", things });
    await user.click(screen.getByText("Static item"));
    expect(screen.queryByText("Complexity")).not.toBeInTheDocument();
  });

  it("auto-expands first inbox item", () => {
    const things = [
      createThing({ name: "First inbox", bucket: "inbox" }),
      createThing({ name: "Second inbox", bucket: "inbox" }),
    ];
    renderThingList({ bucket: "inbox", things, onEdit: vi.fn() });
    // First inbox item should be auto-expanded (triage buttons visible)
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
  });

  it("does not re-expand inbox item after user collapses", async () => {
    const user = userEvent.setup();
    const things = [
      createThing({ name: "Collapsible inbox", bucket: "inbox" }),
    ];
    renderThingList({ bucket: "inbox", things, onEdit: vi.fn() });
    // Should be auto-expanded
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
    // Click collapse button to collapse
    await user.click(screen.getByLabelText("Collapse Collapsible inbox"));
    // Should stay collapsed — triage buttons gone
    expect(screen.queryByLabelText("Move to Next")).not.toBeInTheDocument();
  });

  it("re-expands next inbox item after current is removed", () => {
    const things = [
      createThing({ name: "First inbox", bucket: "inbox" }),
      createThing({ name: "Second inbox", bucket: "inbox" }),
    ];
    const wrapper = createWrapper();
    const { rerender } = render(
      <ThingList
        {...defaultProps({ bucket: "inbox", things, onEdit: vi.fn() })}
      />,
      { wrapper },
    );
    // First is auto-expanded
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();

    // Simulate triage: first item removed
    rerender(
      <ThingList
        {...defaultProps({
          bucket: "inbox",
          things: [things[1]],
          onEdit: vi.fn(),
        })}
      />,
    );
    // Second item should now be auto-expanded
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
  });

  it("resets expanded state when bucket changes", async () => {
    const user = userEvent.setup();
    const things = [
      createThing({ name: "Next item", bucket: "next" }),
      createThing({ name: "Waiting item", bucket: "waiting" }),
    ];
    const wrapper = createWrapper();
    const { rerender } = render(
      <ThingList
        {...defaultProps({ bucket: "next", things, onEdit: vi.fn() })}
      />,
      { wrapper },
    );
    // Expand the item
    await user.click(screen.getByText("Next item"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();

    // Switch to waiting bucket
    rerender(
      <ThingList
        {...defaultProps({ bucket: "waiting", things, onEdit: vi.fn() })}
      />,
    );
    // Waiting item should NOT be expanded
    expect(screen.queryByText("Complexity")).not.toBeInTheDocument();

    // Switch back to next bucket
    rerender(
      <ThingList
        {...defaultProps({ bucket: "next", things, onEdit: vi.fn() })}
      />,
    );
    // Previously expanded item should be collapsed
    expect(screen.queryByText("Complexity")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Title editing lifecycle
  // -------------------------------------------------------------------------

  it("enables expand when onUpdateTitle provided", async () => {
    const user = userEvent.setup();
    const things = [createThing({ name: "Expandable item", bucket: "next" })];
    renderThingList({ bucket: "next", things, onUpdateTitle: vi.fn() });
    // Click title expands the row
    await user.click(screen.getByText("Expandable item"));
    // Click title again to enter title editing
    await user.click(screen.getByText("Expandable item"));
    expect(screen.getByDisplayValue("Expandable item")).toBeInTheDocument();
  });

  it("calls onUpdateTitle when title edited via Enter", async () => {
    const user = userEvent.setup();
    const things = [createThing({ name: "Edit me", bucket: "next" })];
    const onUpdateTitle = vi.fn();
    renderThingList({ bucket: "next", things, onUpdateTitle });
    // Click title to expand, then click title again to enter editing
    await user.click(screen.getByText("Edit me"));
    await user.click(screen.getByText("Edit me"));
    const input = screen.getByDisplayValue("Edit me");
    await user.clear(input);
    await user.type(input, "Edited title");
    await user.keyboard("{Enter}");

    expect(onUpdateTitle).toHaveBeenCalledWith(things[0].id, "Edited title");
  });

  it("does not call onUpdateTitle on Escape", async () => {
    const user = userEvent.setup();
    const things = [createThing({ name: "Keep me", bucket: "next" })];
    const onUpdateTitle = vi.fn();
    renderThingList({ bucket: "next", things, onUpdateTitle });
    // Click title to expand, then click title again to enter editing
    await user.click(screen.getByText("Keep me"));
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
    const things = [createThing({ name: "No ctx", bucket: "next" })];
    renderThingList({ bucket: "next", things });
    expect(
      screen.queryByRole("group", { name: "Filter by context" }),
    ).not.toBeInTheDocument();
  });

  it("renders context filter bar when things have contexts", () => {
    const things = [
      createThing({
        name: "Call boss",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
    ];
    renderThingList({ bucket: "next", things });
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
        name: "Call boss",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
      createThing({
        name: "Write report",
        bucket: "next",
        contexts: ["@computer"] as unknown as CanonicalId[],
      }),
      createThing({
        name: "Email team",
        bucket: "next",
        contexts: ["@phone", "@computer"] as unknown as CanonicalId[],
      }),
    ];
    renderThingList({ bucket: "next", things });

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
        name: "Phone task",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
      createThing({
        name: "Computer task",
        bucket: "next",
        contexts: ["@computer"] as unknown as CanonicalId[],
      }),
      createThing({
        name: "Office task",
        bucket: "next",
        contexts: ["@office"] as unknown as CanonicalId[],
      }),
    ];
    renderThingList({ bucket: "next", things });

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
        name: "Phone task",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
      createThing({
        name: "Computer task",
        bucket: "next",
        contexts: ["@computer"] as unknown as CanonicalId[],
      }),
    ];
    renderThingList({ bucket: "next", things });

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
    const things = [createThing({ name: "Edit me", bucket: "next" })];
    const onEdit = vi.fn();
    renderThingList({ bucket: "next", things, onEdit });
    await user.click(screen.getByText("Edit me"));
    await user.click(screen.getByRole("button", { name: "high" }));
    expect(onEdit).toHaveBeenCalledWith(things[0].id, {
      energyLevel: "high",
    });
  });
});
