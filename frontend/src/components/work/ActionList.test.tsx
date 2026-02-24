import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActionList } from "./ActionList";
import {
  createActionItem,
  resetFactoryCounter,
  computationPort,
} from "@/model/factories";
import type { CanonicalId } from "@/model/canonical-id";

// dnd-kit stub (ActionRow uses useDraggable)
vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
}));

// Mock completed items hook — returns _completedData when enabled
import type { ActionItem } from "@/model/types";
let _completedData: ActionItem[] = [];
vi.mock("@/hooks/use-items", () => ({
  useAllCompletedItems: (enabled: boolean) => ({
    data: enabled ? _completedData : [],
    isFetching: false,
  }),
}));

beforeEach(() => {
  resetFactoryCounter();
  _completedData = [];
  sessionStorage.clear();
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
  overrides: Partial<Parameters<typeof ActionList>[0]> = {},
) {
  return {
    bucket: "next" as const,
    items: [] as ReturnType<typeof createActionItem>[],
    onAdd: noop,
    onComplete: noop,
    onToggleFocus: noop,
    onMove: noop,
    onArchive: noop,
    ...overrides,
  };
}

function renderActionList(
  overrides: Partial<Parameters<typeof ActionList>[0]> = {},
) {
  return render(<ActionList {...defaultProps(overrides)} />, {
    wrapper: createWrapper(),
  });
}

describe("ActionList", () => {
  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  it("renders bucket header for inbox", () => {
    renderActionList({ bucket: "inbox" });
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Capture and clarify")).toBeInTheDocument();
  });

  it("renders bucket header for next", () => {
    renderActionList({ bucket: "next" });
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("To-do's for anytime")).toBeInTheDocument();
  });

  it("renders bucket header for focus", () => {
    renderActionList({ bucket: "focus" });
    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("Starred actions")).toBeInTheDocument();
  });

  it("renders bucket header for waiting", () => {
    renderActionList({ bucket: "waiting" });
    expect(screen.getByText("Waiting")).toBeInTheDocument();
  });

  it("renders bucket header for calendar", () => {
    renderActionList({ bucket: "calendar" });
    expect(screen.getByText("Calendar")).toBeInTheDocument();
  });

  it("renders bucket header for someday", () => {
    renderActionList({ bucket: "someday" });
    expect(screen.getByText("Later")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Empty states
  // -------------------------------------------------------------------------

  it("shows empty state for inbox", () => {
    renderActionList({ bucket: "inbox" });
    expect(screen.getByText("Inbox is empty")).toBeInTheDocument();
    expect(
      screen.getByText("Capture a thought to get started"),
    ).toBeInTheDocument();
  });

  it("shows empty state for next actions", () => {
    renderActionList({ bucket: "next" });
    expect(screen.getByText("No actions here yet")).toBeInTheDocument();
  });

  it("shows empty state for focus", () => {
    renderActionList({ bucket: "focus" });
    expect(screen.getByText("No focused actions")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Filtering by bucket
  // -------------------------------------------------------------------------

  it("filters things by bucket", () => {
    const items = [
      createActionItem({ name: "Next task", bucket: "next" }),
      createActionItem({ name: "Inbox task", bucket: "inbox" }),
      createActionItem({ name: "Someday task", bucket: "someday" }),
    ];
    renderActionList({ bucket: "next", items });
    expect(screen.getByText("Next task")).toBeInTheDocument();
    expect(screen.queryByText("Inbox task")).not.toBeInTheDocument();
    expect(screen.queryByText("Someday task")).not.toBeInTheDocument();
  });

  it("shows focused things in focus view regardless of bucket", () => {
    const items = [
      createActionItem({
        name: "Focused next",
        bucket: "next",
        isFocused: true,
      }),
      createActionItem({
        name: "Focused waiting",
        bucket: "waiting",
        isFocused: true,
      }),
      createActionItem({ name: "Unfocused next", bucket: "next" }),
    ];
    renderActionList({ bucket: "focus", items });
    expect(screen.getByText("Focused next")).toBeInTheDocument();
    expect(screen.getByText("Focused waiting")).toBeInTheDocument();
    expect(screen.queryByText("Unfocused next")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Collapsible Done section (completed items)
  // -------------------------------------------------------------------------

  it("does not show Done section when no completed items", () => {
    const items = [createActionItem({ name: "Active", bucket: "next" })];
    renderActionList({ bucket: "next", items });
    expect(
      screen.queryByRole("button", { name: /Done/ }),
    ).not.toBeInTheDocument();
  });

  it("shows collapsed Done section when completed items exist", () => {
    _completedData = [
      createActionItem({
        name: "Done task A",
        bucket: "next",
        completedAt: "2026-01-20T10:00:00Z",
      }),
    ];
    const items = [createActionItem({ name: "Active task", bucket: "next" })];
    renderActionList({ bucket: "next", items });

    expect(
      screen.getByRole("button", { name: "Expand Done" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Done task A")).not.toBeInTheDocument();
  });

  it(
    "expands Done section to show completed items",
    { timeout: 15_000 },
    async () => {
      const user = userEvent.setup();
      _completedData = [
        createActionItem({
          name: "Done task A",
          bucket: "next",
          completedAt: "2026-01-20T10:00:00Z",
        }),
        createActionItem({
          name: "Done task B",
          bucket: "next",
          completedAt: "2026-01-18T10:00:00Z",
        }),
      ];
      const items = [createActionItem({ name: "Active task", bucket: "next" })];
      renderActionList({ bucket: "next", items });

      await user.click(screen.getByRole("button", { name: "Expand Done" }));

      expect(screen.getByText("Done task A")).toBeInTheDocument();
      expect(screen.getByText("Done task B")).toBeInTheDocument();
    },
  );

  it("collapses Done section on second click", async () => {
    const user = userEvent.setup();
    _completedData = [
      createActionItem({
        name: "Done item",
        bucket: "next",
        completedAt: "2026-01-20T10:00:00Z",
      }),
    ];
    const items = [createActionItem({ name: "Active", bucket: "next" })];
    renderActionList({ bucket: "next", items });

    await user.click(screen.getByRole("button", { name: "Expand Done" }));
    expect(screen.getByText("Done item")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Done" }));
    expect(screen.queryByText("Done item")).not.toBeInTheDocument();
  });

  it("Done section appears below active items", async () => {
    const user = userEvent.setup();
    _completedData = [
      createActionItem({
        name: "Done item",
        bucket: "next",
        completedAt: "2026-01-20T10:00:00Z",
      }),
    ];
    const items = [createActionItem({ name: "Active item", bucket: "next" })];
    renderActionList({ bucket: "next", items });

    await user.click(screen.getByRole("button", { name: "Expand Done" }));

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
    const items = [
      createActionItem({ name: "Task A", bucket: "next" }),
      createActionItem({ name: "Task B", bucket: "next" }),
    ];
    renderActionList({ bucket: "next", items });
    expect(screen.getByText("2 actions")).toBeInTheDocument();
  });

  it("shows item count for inbox", () => {
    const items = [
      createActionItem({ name: "Thought A", bucket: "inbox" }),
      createActionItem({ name: "Thought B", bucket: "inbox" }),
      createActionItem({ name: "Thought C", bucket: "inbox" }),
    ];
    renderActionList({ bucket: "inbox", items });
    expect(screen.getByText("3 items to process")).toBeInTheDocument();
  });

  it("uses singular 'action' for single item", () => {
    const items = [createActionItem({ name: "Solo", bucket: "next" })];
    renderActionList({ bucket: "next", items });
    expect(screen.getByText("1 action")).toBeInTheDocument();
  });

  it("uses singular 'item' for single inbox item", () => {
    const items = [createActionItem({ name: "Solo", bucket: "inbox" })];
    renderActionList({ bucket: "inbox", items });
    expect(screen.getByText("1 item to process")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Rapid entry / capture
  // -------------------------------------------------------------------------

  it("shows capture input for inbox", () => {
    renderActionList({ bucket: "inbox" });
    expect(screen.getByLabelText("Capture a thought")).toBeInTheDocument();
  });

  it("shows rapid entry for action buckets", () => {
    renderActionList({ bucket: "next" });
    expect(screen.getByLabelText("Rapid entry")).toBeInTheDocument();
  });

  it("hides rapid entry in focus view", () => {
    renderActionList({ bucket: "focus" });
    expect(screen.queryByLabelText("Rapid entry")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Capture a thought"),
    ).not.toBeInTheDocument();
  });

  it("calls onAdd via rapid entry", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderActionList({ bucket: "next", onAdd });
    const input = screen.getByLabelText("Rapid entry");
    await user.type(input, "New task{Enter}");
    expect(onAdd).toHaveBeenCalledWith("New task");
  });

  it("calls onAdd via inbox capture", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderActionList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "New thought{Enter}");
    expect(onAdd).toHaveBeenCalledWith("New thought");
  });

  it("does not call onAdd for empty input", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderActionList({ bucket: "next", onAdd });
    const input = screen.getByLabelText("Rapid entry");
    await user.type(input, "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("clears input optimistically even when onAdd rejects", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error("Network error"));
    renderActionList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "Buy groceries{Enter}");
    // Input is cleared optimistically — not restored on error
    expect(input).toHaveValue("");
  });

  it("clears input text when onAdd resolves", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    renderActionList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "Buy groceries{Enter}");
    expect(input).toHaveValue("");
  });

  it("shows error message when onAdd rejects", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error("Network error"));
    renderActionList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "Buy groceries{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(/failed/i);
  });

  it("does not disable input while onAdd is pending", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(
      () => new Promise<void>(() => {}), // never resolves
    );
    renderActionList({ bucket: "inbox", onAdd });
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
    renderActionList({ bucket: "inbox", onAdd });
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
    renderActionList({ bucket: "inbox", onAdd });
    const input = screen.getByLabelText("Capture a thought");
    await user.type(input, "line1{Shift>}{Enter}{/Shift}line2{Enter}");
    expect(onAdd).toHaveBeenCalledTimes(1);
    const captured = onAdd.mock.calls[0]?.[0] as string;
    expect(captured).toContain("line1");
    expect(captured).toContain("line2");
    expect(captured).toContain("\n");
  });

  it("resets textarea height after multiline submit", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderActionList({ bucket: "inbox", onAdd });
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
    const items = [
      createActionItem({
        name: "Newer",
        bucket: "inbox",
        provenance: {
          createdAt: "2026-02-05T10:00:00Z",
          updatedAt: "2026-02-05T10:00:00Z",
          history: [],
        },
      }),
      createActionItem({
        name: "Older",
        bucket: "inbox",
        provenance: {
          createdAt: "2026-02-01T10:00:00Z",
          updatedAt: "2026-02-01T10:00:00Z",
          history: [],
        },
      }),
    ];
    renderActionList({ bucket: "inbox", items });

    const older = screen.getByText("Older");
    const newer = screen.getByText("Newer");
    expect(
      newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("sorts actions newest first (no sequenceOrder)", () => {
    const items = [
      createActionItem({
        name: "Older action",
        bucket: "next",
        provenance: {
          createdAt: "2026-01-10T10:00:00Z",
          updatedAt: "2026-01-10T10:00:00Z",
          history: [],
        },
      }),
      createActionItem({
        name: "Newer action",
        bucket: "next",
        provenance: {
          createdAt: "2026-02-05T10:00:00Z",
          updatedAt: "2026-02-05T10:00:00Z",
          history: [],
        },
      }),
    ];
    renderActionList({ bucket: "next", items });

    const newer = screen.getByText("Newer action");
    const older = screen.getByText("Older action");
    expect(
      newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("sorts focused actions first in action buckets", () => {
    const items = [
      createActionItem({ name: "Unfocused first", bucket: "next" }),
      createActionItem({
        name: "Focused second",
        bucket: "next",
        isFocused: true,
      }),
    ];
    renderActionList({ bucket: "next", items });

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
    const items = [createActionItem({ name: "Editable item", bucket: "next" })];
    renderActionList({ bucket: "next", items, onEdit: vi.fn() });
    await user.click(screen.getByText("Editable item"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();
  });

  it("only expands one item at a time", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({ name: "First item", bucket: "next" }),
      createActionItem({ name: "Second item", bucket: "next" }),
    ];
    renderActionList({ bucket: "next", items, onEdit: vi.fn() });
    await user.click(screen.getByText("First item"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();

    await user.click(screen.getByText("Second item"));
    expect(screen.getAllByText("Complexity")).toHaveLength(1);
  });

  it("does not expand when no onEdit or onUpdateTitle", async () => {
    const user = userEvent.setup();
    const items = [createActionItem({ name: "Static item", bucket: "next" })];
    renderActionList({ bucket: "next", items });
    await user.click(screen.getByText("Static item"));
    expect(screen.queryByText("Complexity")).not.toBeInTheDocument();
  });

  it("auto-expands the first inbox item on load", () => {
    const items = [
      createActionItem({ name: "First inbox", bucket: "inbox" }),
      createActionItem({ name: "Second inbox", bucket: "inbox" }),
    ];
    renderActionList({ bucket: "inbox", items, onEdit: vi.fn() });
    // First inbox item is auto-expanded — triage buttons visible
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
  });

  it("does not auto-expand items in non-inbox buckets", () => {
    const items = [createActionItem({ name: "Next task", bucket: "next" })];
    renderActionList({ bucket: "next", items, onEdit: vi.fn() });
    expect(screen.queryByLabelText("Move to Next")).not.toBeInTheDocument();
  });

  it("expands inbox item on click and shows triage buttons", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({ name: "Clickable inbox", bucket: "inbox" }),
    ];
    renderActionList({ bucket: "inbox", items, onEdit: vi.fn() });
    // Click item to expand
    await user.click(screen.getByText("Clickable inbox"));
    // Triage buttons now visible
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
  });

  it("auto-advances to next inbox item after current is triaged away", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({ name: "First inbox", bucket: "inbox" }),
      createActionItem({ name: "Second inbox", bucket: "inbox" }),
    ];
    const wrapper = createWrapper();
    const { rerender } = render(
      <ActionList
        {...defaultProps({ bucket: "inbox", items, onEdit: vi.fn() })}
      />,
      { wrapper },
    );
    // Click first item to expand it
    await user.click(screen.getByText("First inbox"));
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();

    // Simulate triage: first item removed
    rerender(
      <ActionList
        {...defaultProps({
          bucket: "inbox",
          items: [items[1]!],
          onEdit: vi.fn(),
        })}
      />,
    );
    // Second item should auto-advance (expand) after triage
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
  });

  it("resets expanded state when bucket changes", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({ name: "Next item", bucket: "next" }),
      createActionItem({ name: "Waiting item", bucket: "waiting" }),
    ];
    const wrapper = createWrapper();
    const { rerender } = render(
      <ActionList
        {...defaultProps({ bucket: "next", items, onEdit: vi.fn() })}
      />,
      { wrapper },
    );
    // Expand the item
    await user.click(screen.getByText("Next item"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();

    // Switch to waiting bucket
    rerender(
      <ActionList
        {...defaultProps({ bucket: "waiting", items, onEdit: vi.fn() })}
      />,
    );
    // Waiting item should NOT be expanded
    expect(screen.queryByText("Complexity")).not.toBeInTheDocument();

    // Switch back to next bucket
    rerender(
      <ActionList
        {...defaultProps({ bucket: "next", items, onEdit: vi.fn() })}
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
    const items = [
      createActionItem({ name: "Expandable item", bucket: "next" }),
    ];
    renderActionList({ bucket: "next", items, onUpdateTitle: vi.fn() });
    // Click title expands the row
    await user.click(screen.getByText("Expandable item"));
    // Double-click title to enter title editing
    await user.dblClick(screen.getByText("Expandable item"));
    expect(screen.getByDisplayValue("Expandable item")).toBeInTheDocument();
  });

  it("calls onUpdateTitle when title edited via Enter", async () => {
    const user = userEvent.setup();
    const items = [createActionItem({ name: "Edit me", bucket: "next" })];
    const onUpdateTitle = vi.fn();
    renderActionList({ bucket: "next", items, onUpdateTitle });
    // Click title to expand, then double-click to enter editing
    await user.click(screen.getByText("Edit me"));
    await user.dblClick(screen.getByText("Edit me"));
    const input = screen.getByDisplayValue("Edit me");
    await user.clear(input);
    await user.type(input, "Edited title");
    await user.keyboard("{Enter}");

    expect(onUpdateTitle).toHaveBeenCalledWith(items[0]?.id, "Edited title");
  });

  it("does not call onUpdateTitle on Escape", async () => {
    const user = userEvent.setup();
    const items = [createActionItem({ name: "Keep me", bucket: "next" })];
    const onUpdateTitle = vi.fn();
    renderActionList({ bucket: "next", items, onUpdateTitle });
    // Click title to expand, then double-click to enter editing
    await user.click(screen.getByText("Keep me"));
    await user.dblClick(screen.getByText("Keep me"));
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
    const items = [createActionItem({ name: "No ctx", bucket: "next" })];
    renderActionList({ bucket: "next", items });
    expect(
      screen.queryByRole("group", { name: "Filter by context" }),
    ).not.toBeInTheDocument();
  });

  it("renders context filter bar when things have contexts", () => {
    const items = [
      createActionItem({
        name: "Call boss",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
    ];
    renderActionList({ bucket: "next", items });
    expect(
      screen.getByRole("group", { name: "Filter by context" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /@phone/ }),
    ).toBeInTheDocument();
  });

  it("clicking a context chip filters displayed things", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({
        name: "Call boss",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
      createActionItem({
        name: "Write report",
        bucket: "next",
        contexts: ["@computer"] as unknown as CanonicalId[],
      }),
      createActionItem({
        name: "Email team",
        bucket: "next",
        contexts: ["@phone", "@computer"] as unknown as CanonicalId[],
      }),
    ];
    renderActionList({ bucket: "next", items });

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
    const items = [
      createActionItem({
        name: "Phone task",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
      createActionItem({
        name: "Computer task",
        bucket: "next",
        contexts: ["@computer"] as unknown as CanonicalId[],
      }),
      createActionItem({
        name: "Office task",
        bucket: "next",
        contexts: ["@office"] as unknown as CanonicalId[],
      }),
    ];
    renderActionList({ bucket: "next", items });

    await user.click(screen.getByRole("checkbox", { name: /@phone/ }));
    await user.click(screen.getByRole("checkbox", { name: /@computer/ }));

    expect(screen.getByText("Phone task")).toBeInTheDocument();
    expect(screen.getByText("Computer task")).toBeInTheDocument();
    expect(screen.queryByText("Office task")).not.toBeInTheDocument();
  });

  it("Clear button resets to showing all things", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({
        name: "Phone task",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
      }),
      createActionItem({
        name: "Computer task",
        bucket: "next",
        contexts: ["@computer"] as unknown as CanonicalId[],
      }),
    ];
    renderActionList({ bucket: "next", items });

    await user.click(screen.getByRole("checkbox", { name: /@phone/ }));
    expect(screen.queryByText("Computer task")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Clear context filters"));
    expect(screen.getByText("Phone task")).toBeInTheDocument();
    expect(screen.getByText("Computer task")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Energy filter integration
  // -------------------------------------------------------------------------

  it("energy filter shows only items matching selected energy level", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({
        name: "High energy task",
        bucket: "next",
        contexts: ["@office"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "high" })],
      }),
      createActionItem({
        name: "Low energy task",
        bucket: "next",
        contexts: ["@office"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "low" })],
      }),
      createActionItem({
        name: "No energy task",
        bucket: "next",
        contexts: ["@office"] as unknown as CanonicalId[],
      }),
    ];
    renderActionList({ bucket: "next", items });

    expect(screen.getByText("High energy task")).toBeInTheDocument();
    expect(screen.getByText("Low energy task")).toBeInTheDocument();
    expect(screen.getByText("No energy task")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "high" }));

    expect(screen.getByText("High energy task")).toBeInTheDocument();
    expect(screen.queryByText("Low energy task")).not.toBeInTheDocument();
    expect(screen.queryByText("No energy task")).not.toBeInTheDocument();
  });

  it("clicking selected energy level deselects it (shows all items again)", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({
        name: "High task",
        bucket: "next",
        contexts: ["@office"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "high" })],
      }),
      createActionItem({
        name: "Low task",
        bucket: "next",
        contexts: ["@office"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "low" })],
      }),
    ];
    renderActionList({ bucket: "next", items });

    await user.click(screen.getByRole("radio", { name: "high" }));
    expect(screen.queryByText("Low task")).not.toBeInTheDocument();

    // Click again to deselect
    await user.click(screen.getByRole("radio", { name: "high" }));
    expect(screen.getByText("High task")).toBeInTheDocument();
    expect(screen.getByText("Low task")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Time filter integration
  // -------------------------------------------------------------------------

  it("time filter shows items with timeEstimate <= threshold", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({
        name: "Quick task",
        bucket: "next",
        contexts: ["@office"] as unknown as CanonicalId[],
        ports: [computationPort({ timeEstimate: "15min" })],
      }),
      createActionItem({
        name: "Long task",
        bucket: "next",
        contexts: ["@office"] as unknown as CanonicalId[],
        ports: [computationPort({ timeEstimate: "2hr" })],
      }),
      createActionItem({
        name: "No time task",
        bucket: "next",
        contexts: ["@office"] as unknown as CanonicalId[],
      }),
    ];
    renderActionList({ bucket: "next", items });

    expect(screen.getByText("Quick task")).toBeInTheDocument();
    expect(screen.getByText("Long task")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Time available"), "30min");

    expect(screen.getByText("Quick task")).toBeInTheDocument();
    expect(screen.queryByText("Long task")).not.toBeInTheDocument();
    // Items without timeEstimate are excluded when filter is active
    expect(screen.queryByText("No time task")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Combined filters
  // -------------------------------------------------------------------------

  it("combined context + energy + time filters work together", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({
        name: "Phone high quick",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "high", timeEstimate: "15min" })],
      }),
      createActionItem({
        name: "Phone low quick",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "low", timeEstimate: "5min" })],
      }),
      createActionItem({
        name: "Computer high quick",
        bucket: "next",
        contexts: ["@computer"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "high", timeEstimate: "15min" })],
      }),
      createActionItem({
        name: "Phone high long",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "high", timeEstimate: "2hr" })],
      }),
    ];
    renderActionList({ bucket: "next", items });

    // Filter by @phone context
    await user.click(screen.getByRole("checkbox", { name: /@phone/ }));
    // Filter by high energy
    await user.click(screen.getByRole("radio", { name: "high" }));
    // Filter by 30min time
    await user.selectOptions(screen.getByLabelText("Time available"), "30min");

    // Only "Phone high quick" matches all three filters
    expect(screen.getByText("Phone high quick")).toBeInTheDocument();
    expect(screen.queryByText("Phone low quick")).not.toBeInTheDocument();
    expect(screen.queryByText("Computer high quick")).not.toBeInTheDocument();
    expect(screen.queryByText("Phone high long")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Filter-specific empty state
  // -------------------------------------------------------------------------

  it("shows filter-specific empty state when all items filtered out", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({
        name: "Low energy only",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "low" })],
      }),
    ];
    renderActionList({ bucket: "next", items });

    // Select high energy — no items match
    await user.click(screen.getByRole("radio", { name: "high" }));

    expect(
      screen.getByText("No actions match your filters"),
    ).toBeInTheDocument();
    expect(screen.getByText("Clear filters")).toBeInTheDocument();
  });

  it("Clear filters button in empty state resets all filters", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({
        name: "Low energy only",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "low" })],
      }),
    ];
    renderActionList({ bucket: "next", items });

    await user.click(screen.getByRole("radio", { name: "high" }));
    expect(screen.queryByText("Low energy only")).not.toBeInTheDocument();

    await user.click(screen.getByText("Clear filters"));
    expect(screen.getByText("Low energy only")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Filter state persists across bucket change (sessionStorage)
  // -------------------------------------------------------------------------

  it("filter state persists across bucket change via sessionStorage", async () => {
    const user = userEvent.setup();
    const items = [
      createActionItem({
        name: "Next phone high",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "high" })],
      }),
      createActionItem({
        name: "Next phone low",
        bucket: "next",
        contexts: ["@phone"] as unknown as CanonicalId[],
        ports: [computationPort({ energyLevel: "low" })],
      }),
      createActionItem({
        name: "Waiting task",
        bucket: "waiting",
        contexts: ["@office"] as unknown as CanonicalId[],
      }),
    ];
    const wrapper = createWrapper();
    const { rerender } = render(
      <ActionList
        {...defaultProps({ bucket: "next", items, onEdit: vi.fn() })}
      />,
      { wrapper },
    );

    // Select high energy filter on next bucket
    await user.click(screen.getByRole("radio", { name: "high" }));
    expect(screen.queryByText("Next phone low")).not.toBeInTheDocument();

    // Switch to waiting bucket
    rerender(
      <ActionList
        {...defaultProps({ bucket: "waiting", items, onEdit: vi.fn() })}
      />,
    );

    // Switch back to next — filter should be restored from sessionStorage
    rerender(
      <ActionList
        {...defaultProps({ bucket: "next", items, onEdit: vi.fn() })}
      />,
    );
    expect(screen.getByText("Next phone high")).toBeInTheDocument();
    expect(screen.queryByText("Next phone low")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // onEdit callback forwarding
  // -------------------------------------------------------------------------

  it("passes onEdit to expanded item", async () => {
    const user = userEvent.setup();
    const items = [createActionItem({ name: "Edit me", bucket: "next" })];
    const onEdit = vi.fn();
    renderActionList({ bucket: "next", items, onEdit });
    await user.click(screen.getByText("Edit me"));
    await user.click(screen.getByRole("button", { name: "high" }));
    expect(onEdit).toHaveBeenCalledWith(items[0]?.id, {
      energyLevel: "high",
    });
  });

  // -------------------------------------------------------------------------
  // File drop zone (appears only during file drag)
  // -------------------------------------------------------------------------

  function simulateFileDragEnter() {
    act(() => {
      fireEvent.dragEnter(document, {
        dataTransfer: { types: ["Files"] },
      });
    });
  }

  it("hides FileDropZone at rest even when onFileDrop is provided", () => {
    renderActionList({ bucket: "inbox", onFileDrop: vi.fn() });
    expect(screen.queryByTestId("file-drop-zone")).not.toBeInTheDocument();
  });

  it("shows FileDropZone when files are dragged into inbox", () => {
    renderActionList({ bucket: "inbox", onFileDrop: vi.fn() });
    simulateFileDragEnter();
    expect(screen.getByTestId("file-drop-zone")).toBeInTheDocument();
  });

  it("hides FileDropZone when file drag leaves", () => {
    vi.useFakeTimers();
    renderActionList({ bucket: "inbox", onFileDrop: vi.fn() });
    simulateFileDragEnter();
    expect(screen.getByTestId("file-drop-zone")).toBeInTheDocument();

    act(() => {
      fireEvent.dragLeave(document, {
        dataTransfer: { types: ["Files"] },
      });
    });
    // Hide is debounced to avoid flicker from DOM layout shifts
    expect(screen.getByTestId("file-drop-zone")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(50));
    expect(screen.queryByTestId("file-drop-zone")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does not show FileDropZone when onFileDrop is not provided", () => {
    renderActionList({ bucket: "inbox" });
    simulateFileDragEnter();
    expect(screen.queryByTestId("file-drop-zone")).not.toBeInTheDocument();
  });

  it("does not show FileDropZone for non-inbox buckets during file drag", () => {
    renderActionList({ bucket: "next", onFileDrop: vi.fn() });
    simulateFileDragEnter();
    expect(screen.queryByTestId("file-drop-zone")).not.toBeInTheDocument();
  });

  it("does not show FileDropZone in focus view during file drag", () => {
    renderActionList({ bucket: "focus", onFileDrop: vi.fn() });
    simulateFileDragEnter();
    expect(screen.queryByTestId("file-drop-zone")).not.toBeInTheDocument();
  });
});
