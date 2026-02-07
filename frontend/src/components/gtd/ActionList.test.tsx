import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionList } from "./ActionList";
import { createAction, resetFactoryCounter } from "@/model/factories";

beforeEach(() => resetFactoryCounter());

const makeActions = () => [
  createAction({ title: "Call client", bucket: "next", isFocused: true }),
  createAction({ title: "Review budget", bucket: "next" }),
  createAction({ title: "Plan offsite", bucket: "someday" }),
];

const noop = vi.fn();

describe("ActionList", () => {
  it("renders bucket header", () => {
    render(
      <ActionList
        bucket="next"
        actions={[]}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText("Next Actions")).toBeInTheDocument();
    expect(screen.getByText("To-do's for anytime")).toBeInTheDocument();
  });

  it("shows empty state when no actions", () => {
    render(
      <ActionList
        bucket="next"
        actions={[]}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText("No actions here yet")).toBeInTheDocument();
  });

  it("filters actions by bucket", () => {
    const actions = makeActions();
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText("Call client")).toBeInTheDocument();
    expect(screen.getByText("Review budget")).toBeInTheDocument();
    expect(screen.queryByText("Plan offsite")).not.toBeInTheDocument();
  });

  it("shows focused actions in focus view", () => {
    const actions = makeActions();
    render(
      <ActionList
        bucket="focus"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText("Call client")).toBeInTheDocument();
    expect(screen.queryByText("Review budget")).not.toBeInTheDocument();
  });

  it("hides completed actions", () => {
    const actions = [
      createAction({
        title: "Done item",
        bucket: "next",
        completedAt: new Date().toISOString(),
      }),
      createAction({ title: "Active item", bucket: "next" }),
    ];
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    expect(screen.queryByText("Done item")).not.toBeInTheDocument();
    expect(screen.getByText("Active item")).toBeInTheDocument();
  });

  it("shows action count", () => {
    const actions = makeActions();
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText("2 actions")).toBeInTheDocument();
  });

  it("calls onAdd via rapid entry", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <ActionList
        bucket="next"
        actions={[]}
        onAdd={onAdd}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    const input = screen.getByLabelText("Rapid entry");
    await user.type(input, "New task{Enter}");
    expect(onAdd).toHaveBeenCalledWith("New task");
  });

  it("hides rapid entry in focus view", () => {
    render(
      <ActionList
        bucket="focus"
        actions={[]}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    expect(screen.queryByLabelText("Rapid entry")).not.toBeInTheDocument();
  });

  it("sorts focused actions first", () => {
    const actions = [
      createAction({ title: "Unfocused first", bucket: "next" }),
      createAction({
        title: "Focused second",
        bucket: "next",
        isFocused: true,
      }),
    ];
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    // The action titles appear in order; getByText finds them in DOM order
    const focused = screen.getByText("Focused second");
    const unfocused = screen.getByText("Unfocused first");
    // Focused should appear before unfocused in DOM
    expect(
      focused.compareDocumentPosition(unfocused) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("expands action editor on title click", async () => {
    const user = userEvent.setup();
    const actions = [createAction({ title: "Editable item", bucket: "next" })];
    const onEdit = vi.fn();
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
        onEditAction={onEdit}
      />,
    );
    await user.click(screen.getByText("Editable item"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();
  });

  it("collapses editor on re-click", async () => {
    const user = userEvent.setup();
    const actions = [createAction({ title: "Toggle item", bucket: "next" })];
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
        onEditAction={vi.fn()}
      />,
    );
    await user.click(screen.getByText("Toggle item"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();
    // When expanded, title is an editable input — press Escape to collapse
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Complexity")).not.toBeInTheDocument();
  });

  it("only expands one action at a time", async () => {
    const user = userEvent.setup();
    const actions = [
      createAction({ title: "First action", bucket: "next" }),
      createAction({ title: "Second action", bucket: "next" }),
    ];
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
        onEditAction={vi.fn()}
      />,
    );
    await user.click(screen.getByText("First action"));
    expect(screen.getByText("Complexity")).toBeInTheDocument();
    await user.click(screen.getByText("Second action"));
    // Only one editor should be visible
    expect(screen.getAllByText("Complexity")).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Title editing lifecycle
  // -----------------------------------------------------------------------

  it("enables expand when onUpdateTitle provided (without onEditAction)", async () => {
    const user = userEvent.setup();
    const actions = [
      createAction({ title: "Expandable item", bucket: "next" }),
    ];
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
        onUpdateTitle={vi.fn()}
      />,
    );
    // Title should be a clickable button
    await user.click(screen.getByText("Expandable item"));
    // Should now show editable input
    expect(screen.getByDisplayValue("Expandable item")).toBeInTheDocument();
  });

  it("calls onUpdateTitle when action title edited via Enter", async () => {
    const user = userEvent.setup();
    const actions = [createAction({ title: "Edit me", bucket: "next" })];
    const onUpdateTitle = vi.fn();
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
        onUpdateTitle={onUpdateTitle}
      />,
    );
    // Expand
    await user.click(screen.getByText("Edit me"));
    const input = screen.getByDisplayValue("Edit me");
    await user.clear(input);
    await user.type(input, "Edited title");
    await user.keyboard("{Enter}");

    expect(onUpdateTitle).toHaveBeenCalledWith(actions[0].id, "Edited title");
  });

  it("does not call onUpdateTitle on Escape", async () => {
    const user = userEvent.setup();
    const actions = [createAction({ title: "Keep me", bucket: "next" })];
    const onUpdateTitle = vi.fn();
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
        onUpdateTitle={onUpdateTitle}
      />,
    );
    await user.click(screen.getByText("Keep me"));
    const input = screen.getByDisplayValue("Keep me");
    await user.clear(input);
    await user.type(input, "Changed");
    await user.keyboard("{Escape}");

    expect(onUpdateTitle).not.toHaveBeenCalled();
  });

  it("auto-saves on blur when clicking another action", async () => {
    const user = userEvent.setup();
    const actions = [
      createAction({ title: "First action", bucket: "next" }),
      createAction({ title: "Second action", bucket: "next" }),
    ];
    const onUpdateTitle = vi.fn();
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
        onUpdateTitle={onUpdateTitle}
      />,
    );

    // Expand first action and edit
    await user.click(screen.getByText("First action"));
    const input = screen.getByDisplayValue("First action");
    await user.clear(input);
    await user.type(input, "Auto-saved");

    // Click second action — blur on first fires save
    await user.click(screen.getByText("Second action"));

    expect(onUpdateTitle).toHaveBeenCalledWith(actions[0].id, "Auto-saved");
    // Second action should now be expanded
    expect(screen.getByDisplayValue("Second action")).toBeInTheDocument();
  });

  it("enter saves and collapses, re-expand shows new title after rerender", async () => {
    const user = userEvent.setup();
    const actions = [createAction({ title: "Old name", bucket: "next" })];
    const onUpdateTitle = vi.fn();

    const { rerender } = render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
        onUpdateTitle={onUpdateTitle}
      />,
    );

    // Edit and save
    await user.click(screen.getByText("Old name"));
    const input = screen.getByDisplayValue("Old name");
    await user.clear(input);
    await user.type(input, "New name");
    await user.keyboard("{Enter}");

    expect(onUpdateTitle).toHaveBeenCalledWith(actions[0].id, "New name");

    // Simulate parent updating the action title
    const updated = [{ ...actions[0], title: "New name" }];
    rerender(
      <ActionList
        bucket="next"
        actions={updated}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
        onUpdateTitle={onUpdateTitle}
      />,
    );

    // Title should show as "New name" in collapsed state
    expect(screen.getByText("New name")).toBeInTheDocument();
    // Re-expand to verify editing works again
    await user.click(screen.getByText("New name"));
    expect(screen.getByDisplayValue("New name")).toBeInTheDocument();
  });

  it("passes onEditAction to expanded action", async () => {
    const user = userEvent.setup();
    const actions = [createAction({ title: "Edit me", bucket: "next" })];
    const onEdit = vi.fn();
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
        onEditAction={onEdit}
      />,
    );
    await user.click(screen.getByText("Edit me"));
    await user.click(screen.getByRole("button", { name: "high" }));
    expect(onEdit).toHaveBeenCalledWith(actions[0].id, {
      energyLevel: "high",
    });
  });

  // -----------------------------------------------------------------------
  // Context filter integration
  // -----------------------------------------------------------------------

  it("does not render context filter bar when no actions have contexts", () => {
    const actions = [createAction({ title: "No ctx", bucket: "next" })];
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    expect(
      screen.queryByRole("group", { name: "Filter by context" }),
    ).not.toBeInTheDocument();
  });

  it("renders context filter bar when actions have contexts", () => {
    const actions = [
      createAction({
        title: "Call boss",
        bucket: "next",
        contexts: [
          "@phone",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
    ];
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    expect(
      screen.getByRole("group", { name: "Filter by context" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /@phone/ }),
    ).toBeInTheDocument();
  });

  it("clicking a context chip filters the displayed actions", async () => {
    const user = userEvent.setup();
    const actions = [
      createAction({
        title: "Call boss",
        bucket: "next",
        contexts: [
          "@phone",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
      createAction({
        title: "Write report",
        bucket: "next",
        contexts: [
          "@computer",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
      createAction({
        title: "Email team",
        bucket: "next",
        contexts: [
          "@phone",
          "@computer",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
    ];
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );
    // All 3 visible initially
    expect(screen.getByText("Call boss")).toBeInTheDocument();
    expect(screen.getByText("Write report")).toBeInTheDocument();
    expect(screen.getByText("Email team")).toBeInTheDocument();

    // Click @phone filter
    await user.click(screen.getByRole("checkbox", { name: /@phone/ }));

    // Only @phone actions visible
    expect(screen.getByText("Call boss")).toBeInTheDocument();
    expect(screen.getByText("Email team")).toBeInTheDocument();
    expect(screen.queryByText("Write report")).not.toBeInTheDocument();
  });

  it("multiple context selection uses OR logic", async () => {
    const user = userEvent.setup();
    const actions = [
      createAction({
        title: "Phone task",
        bucket: "next",
        contexts: [
          "@phone",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
      createAction({
        title: "Computer task",
        bucket: "next",
        contexts: [
          "@computer",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
      createAction({
        title: "Office task",
        bucket: "next",
        contexts: [
          "@office",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
    ];
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /@phone/ }));
    await user.click(screen.getByRole("checkbox", { name: /@computer/ }));

    expect(screen.getByText("Phone task")).toBeInTheDocument();
    expect(screen.getByText("Computer task")).toBeInTheDocument();
    expect(screen.queryByText("Office task")).not.toBeInTheDocument();
  });

  it("Clear button resets to showing all actions", async () => {
    const user = userEvent.setup();
    const actions = [
      createAction({
        title: "Phone task",
        bucket: "next",
        contexts: [
          "@phone",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
      createAction({
        title: "Computer task",
        bucket: "next",
        contexts: [
          "@computer",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
    ];
    render(
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={noop}
        onComplete={noop}
        onToggleFocus={noop}
        onMove={noop}
        onSelect={noop}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /@phone/ }));
    expect(screen.queryByText("Computer task")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Clear context filters"));
    expect(screen.getByText("Phone task")).toBeInTheDocument();
    expect(screen.getByText("Computer task")).toBeInTheDocument();
  });
});
