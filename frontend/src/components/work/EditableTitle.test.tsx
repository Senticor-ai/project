import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditableTitle } from "./EditableTitle";

describe("EditableTitle", () => {
  it("renders title as button when not editing", () => {
    render(
      <EditableTitle
        title="My title"
        isEditing={false}
        onToggleEdit={vi.fn()}
      />,
    );
    expect(screen.getByText("My title")).toBeInTheDocument();
    expect(screen.getByText("My title").tagName).toBe("BUTTON");
  });

  it("renders title as input when editing", () => {
    render(
      <EditableTitle
        title="My title"
        isEditing={true}
        onToggleEdit={vi.fn()}
      />,
    );
    const input = screen.getByDisplayValue("My title");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("TEXTAREA");
  });

  it("calls onToggleEdit when button clicked", async () => {
    const user = userEvent.setup();
    const onToggleEdit = vi.fn();
    render(
      <EditableTitle
        title="Click me"
        isEditing={false}
        onToggleEdit={onToggleEdit}
      />,
    );
    await user.click(screen.getByText("Click me"));
    expect(onToggleEdit).toHaveBeenCalledOnce();
  });

  it("calls onSave and onToggleEdit on Enter with changed title", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onToggleEdit = vi.fn();
    render(
      <EditableTitle
        title="Old"
        isEditing={true}
        onSave={onSave}
        onToggleEdit={onToggleEdit}
      />,
    );
    const input = screen.getByDisplayValue("Old");
    await user.clear(input);
    await user.type(input, "New");
    await user.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalledWith("New");
    expect(onToggleEdit).toHaveBeenCalled();
  });

  it("does not call onSave if title unchanged", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onToggleEdit = vi.fn();
    render(
      <EditableTitle
        title="Same"
        isEditing={true}
        onSave={onSave}
        onToggleEdit={onToggleEdit}
      />,
    );
    screen.getByDisplayValue("Same");
    await user.keyboard("{Enter}");
    expect(onSave).not.toHaveBeenCalled();
    expect(onToggleEdit).toHaveBeenCalled();
  });

  it("reverts and collapses on Escape", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onToggleEdit = vi.fn();
    render(
      <EditableTitle
        title="Original"
        isEditing={true}
        onSave={onSave}
        onToggleEdit={onToggleEdit}
      />,
    );
    const input = screen.getByDisplayValue("Original");
    await user.clear(input);
    await user.type(input, "Changed");
    await user.keyboard("{Escape}");
    expect(onSave).not.toHaveBeenCalled();
    expect(onToggleEdit).toHaveBeenCalled();
    expect(input).toHaveValue("Original");
  });

  it("saves on blur without collapsing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onToggleEdit = vi.fn();
    render(
      <>
        <EditableTitle
          title="Blur me"
          isEditing={true}
          onSave={onSave}
          onToggleEdit={onToggleEdit}
        />
        <button>other</button>
      </>,
    );
    const input = screen.getByDisplayValue("Blur me");
    await user.clear(input);
    await user.type(input, "Updated");
    await user.click(screen.getByText("other"));
    expect(onSave).toHaveBeenCalledWith("Updated");
    expect(onToggleEdit).not.toHaveBeenCalled();
  });

  it("shows optimistic title after Enter even before prop updates", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onToggleEdit = vi.fn();
    const { rerender } = render(
      <EditableTitle
        title="Old title"
        isEditing={true}
        onSave={onSave}
        onToggleEdit={onToggleEdit}
      />,
    );
    const input = screen.getByDisplayValue("Old title");
    await user.clear(input);
    await user.type(input, "New title");
    await user.keyboard("{Enter}");

    expect(onSave).toHaveBeenCalledWith("New title");

    // Parent collapses: isEditing=false but title prop still "Old title"
    rerender(
      <EditableTitle
        title="Old title"
        isEditing={false}
        onSave={onSave}
        onToggleEdit={onToggleEdit}
      />,
    );

    // Should show the optimistic (saved) title, not the stale prop
    expect(screen.getByText("New title")).toBeInTheDocument();
    expect(screen.queryByText("Old title")).not.toBeInTheDocument();
  });

  it("clears optimistic title when prop catches up", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onToggleEdit = vi.fn();
    const { rerender } = render(
      <EditableTitle
        title="Old title"
        isEditing={true}
        onSave={onSave}
        onToggleEdit={onToggleEdit}
      />,
    );
    await user.clear(screen.getByDisplayValue("Old title"));
    await user.type(screen.getByDisplayValue(""), "New title");
    await user.keyboard("{Enter}");

    // Collapse with stale prop
    rerender(
      <EditableTitle
        title="Old title"
        isEditing={false}
        onSave={onSave}
        onToggleEdit={onToggleEdit}
      />,
    );
    expect(screen.getByText("New title")).toBeInTheDocument();

    // Prop updates to match saved value
    rerender(
      <EditableTitle
        title="New title"
        isEditing={false}
        onSave={onSave}
        onToggleEdit={onToggleEdit}
      />,
    );
    expect(screen.getByText("New title")).toBeInTheDocument();
  });

  it("shows optimistic title when re-expanded before prop update", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onToggleEdit = vi.fn();
    const { rerender } = render(
      <EditableTitle
        title="Original"
        isEditing={true}
        onSave={onSave}
        onToggleEdit={onToggleEdit}
      />,
    );
    await user.clear(screen.getByDisplayValue("Original"));
    await user.type(screen.getByDisplayValue(""), "Saved value");
    await user.keyboard("{Enter}");

    // Collapse
    rerender(
      <EditableTitle
        title="Original"
        isEditing={false}
        onSave={onSave}
        onToggleEdit={onToggleEdit}
      />,
    );

    // Re-expand before prop updates
    rerender(
      <EditableTitle
        title="Original"
        isEditing={true}
        onSave={onSave}
        onToggleEdit={onToggleEdit}
      />,
    );

    // Input should show the saved value, not the stale prop
    expect(screen.getByDisplayValue("Saved value")).toBeInTheDocument();
  });

  it("preserves line breaks in collapsed view", () => {
    render(
      <EditableTitle
        title={"Line one\nLine two"}
        isEditing={false}
        onToggleEdit={vi.fn()}
      />,
    );
    const button = screen.getByText(/Line one/);
    expect(button.textContent).toBe("Line one\nLine two");
    expect(button.className).toContain("whitespace-pre-wrap");
  });

  it("applies line-through when completed", () => {
    render(
      <EditableTitle
        title="Done task"
        isEditing={false}
        onToggleEdit={vi.fn()}
        completed={true}
      />,
    );
    const button = screen.getByText("Done task");
    expect(button.className).toContain("line-through");
  });
});
