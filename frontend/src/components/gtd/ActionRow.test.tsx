import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionRow } from "./ActionRow";
import { createAction, resetFactoryCounter } from "@/model/factories";

beforeEach(() => resetFactoryCounter());

const baseAction = () =>
  createAction({
    title: "Call client about proposal",
    bucket: "next",
  });

describe("ActionRow", () => {
  it("renders action title", () => {
    const action = baseAction();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Call client about proposal")).toBeInTheDocument();
  });

  it("calls onComplete when checkbox clicked", async () => {
    const user = userEvent.setup();
    const action = baseAction();
    const onComplete = vi.fn();
    render(
      <ActionRow
        action={action}
        onComplete={onComplete}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await user.click(
      screen.getByLabelText("Complete Call client about proposal"),
    );
    expect(onComplete).toHaveBeenCalledWith(action.id);
  });

  it("calls onToggleFocus when star clicked", async () => {
    const user = userEvent.setup();
    const action = baseAction();
    const onToggleFocus = vi.fn();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={onToggleFocus}
        onMove={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Focus Call client about proposal"));
    expect(onToggleFocus).toHaveBeenCalledWith(action.id);
  });

  it("shows filled star when focused", () => {
    const action = createAction({
      title: "Focused task",
      bucket: "next",
      isFocused: true,
    });
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Unfocus Focused task")).toBeInTheDocument();
  });

  it("calls onSelect when title clicked", async () => {
    const user = userEvent.setup();
    const action = baseAction();
    const onSelect = vi.fn();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByText("Call client about proposal"));
    expect(onSelect).toHaveBeenCalledWith(action.id);
  });

  it("shows move menu on click and calls onMove", async () => {
    const user = userEvent.setup();
    const action = baseAction(); // bucket: "next"
    const onMove = vi.fn();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={onMove}
        onSelect={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Move Call client about proposal"));
    // Menu should show buckets except current (next)
    expect(screen.getByText("Move to Waiting")).toBeInTheDocument();
    expect(screen.getByText("Move to Calendar")).toBeInTheDocument();
    expect(screen.getByText("Move to Someday")).toBeInTheDocument();
    expect(screen.queryByText("Move to Next")).not.toBeInTheDocument();

    await user.click(screen.getByText("Move to Someday"));
    expect(onMove).toHaveBeenCalledWith(action.id, "someday");
  });

  it("shows due date when set", () => {
    const action = createAction({
      title: "Task with due date",
      bucket: "next",
      dueDate: "2026-12-25",
    });
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("2026-12-25")).toBeInTheDocument();
  });

  it("shows note indicator when notes exist", () => {
    const action = createAction({
      title: "Task with notes",
      bucket: "next",
      notes: "Some important note",
    });
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    // Note icon should be present (description icon has aria-hidden)
    const noteIcon = document.querySelector(
      '.material-symbols-outlined[aria-hidden="true"]',
    );
    expect(noteIcon).toBeTruthy();
  });

  it("shows bucket badge when showBucket is true", () => {
    const action = baseAction();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        showBucket
      />,
    );
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("renders ItemEditor when isExpanded is true", () => {
    const action = baseAction();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isExpanded={true}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText("Complexity")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
  });

  it("hides ItemEditor when isExpanded is false", () => {
    const action = baseAction();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isExpanded={false}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByText("Complexity")).not.toBeInTheDocument();
  });

  it("calls onToggleExpand on title click when provided", async () => {
    const user = userEvent.setup();
    const action = baseAction();
    const onToggleExpand = vi.fn();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isExpanded={false}
        onToggleExpand={onToggleExpand}
        onEdit={vi.fn()}
      />,
    );
    await user.click(screen.getByText("Call client about proposal"));
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });

  it("calls onEdit with field changes from ItemEditor", async () => {
    const user = userEvent.setup();
    const action = baseAction();
    const onEdit = vi.fn();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isExpanded={true}
        onToggleExpand={vi.fn()}
        onEdit={onEdit}
      />,
    );
    await user.click(screen.getByRole("button", { name: "high" }));
    expect(onEdit).toHaveBeenCalledWith(action.id, { energyLevel: "high" });
  });

  // -----------------------------------------------------------------------
  // Title editing lifecycle
  // -----------------------------------------------------------------------

  it("shows editable input when expanded with onUpdateTitle", () => {
    const action = baseAction();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isExpanded={true}
        onToggleExpand={vi.fn()}
        onUpdateTitle={vi.fn()}
      />,
    );
    expect(
      screen.getByDisplayValue("Call client about proposal"),
    ).toBeInTheDocument();
  });

  it("calls onUpdateTitle with id and new title on Enter", async () => {
    const user = userEvent.setup();
    const action = baseAction();
    const onUpdateTitle = vi.fn();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isExpanded={true}
        onToggleExpand={vi.fn()}
        onUpdateTitle={onUpdateTitle}
      />,
    );
    const input = screen.getByDisplayValue("Call client about proposal");
    await user.clear(input);
    await user.type(input, "Renamed action");
    await user.keyboard("{Enter}");

    expect(onUpdateTitle).toHaveBeenCalledWith(action.id, "Renamed action");
  });

  it("does not call onUpdateTitle if title unchanged on Enter", async () => {
    const user = userEvent.setup();
    const action = baseAction();
    const onUpdateTitle = vi.fn();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isExpanded={true}
        onToggleExpand={vi.fn()}
        onUpdateTitle={onUpdateTitle}
      />,
    );
    screen.getByDisplayValue("Call client about proposal");
    await user.keyboard("{Enter}");

    expect(onUpdateTitle).not.toHaveBeenCalled();
  });

  it("calls onUpdateTitle on blur (auto-save)", async () => {
    const user = userEvent.setup();
    const action = baseAction();
    const onUpdateTitle = vi.fn();
    render(
      <>
        <ActionRow
          action={action}
          onComplete={vi.fn()}
          onToggleFocus={vi.fn()}
          onMove={vi.fn()}
          onSelect={vi.fn()}
          isExpanded={true}
          onToggleExpand={vi.fn()}
          onUpdateTitle={onUpdateTitle}
        />
        <button>other</button>
      </>,
    );
    const input = screen.getByDisplayValue("Call client about proposal");
    await user.clear(input);
    await user.type(input, "Blur-saved action");
    await user.click(screen.getByText("other"));

    expect(onUpdateTitle).toHaveBeenCalledWith(action.id, "Blur-saved action");
  });

  it("does not call onUpdateTitle on Escape (reverts)", async () => {
    const user = userEvent.setup();
    const action = baseAction();
    const onUpdateTitle = vi.fn();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isExpanded={true}
        onToggleExpand={vi.fn()}
        onUpdateTitle={onUpdateTitle}
      />,
    );
    const input = screen.getByDisplayValue("Call client about proposal");
    await user.clear(input);
    await user.type(input, "Will be reverted");
    await user.keyboard("{Escape}");

    expect(onUpdateTitle).not.toHaveBeenCalled();
    expect(input).toHaveValue("Call client about proposal");
  });

  it("allows editing the title", async () => {
    const user = userEvent.setup();
    const action = baseAction();
    const onUpdateTitle = vi.fn();
    const onToggleExpand = vi.fn();
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        isExpanded={true}
        onToggleExpand={onToggleExpand}
        onUpdateTitle={onUpdateTitle}
      />,
    );
    const input = screen.getByDisplayValue("Call client about proposal");
    await user.clear(input);
    await user.type(input, "Follow up with client");
    await user.keyboard("{Enter}");

    expect(onUpdateTitle).toHaveBeenCalledWith(
      action.id,
      "Follow up with client",
    );
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("applies strikethrough when completed", () => {
    const action = createAction({
      title: "Done task",
      bucket: "next",
      completedAt: new Date().toISOString(),
    });
    render(
      <ActionRow
        action={action}
        onComplete={vi.fn()}
        onToggleFocus={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    const title = screen.getByText("Done task");
    expect(title.className).toContain("line-through");
  });
});
