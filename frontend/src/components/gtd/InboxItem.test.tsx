import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InboxItem } from "./InboxItem";
import { createInboxItem, resetFactoryCounter } from "@/model/factories";

beforeEach(() => {
  resetFactoryCounter();
});

describe("InboxItem", () => {
  it("renders item title", () => {
    const item = createInboxItem({ title: "Anruf bei Frau Müller" });
    render(
      <InboxItem
        item={item}
        isExpanded={false}
        onTriage={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(screen.getByText("Anruf bei Frau Müller")).toBeInTheDocument();
  });

  it("shows triage buttons when isExpanded is true", () => {
    const item = createInboxItem({ title: "Expanded item" });
    render(
      <InboxItem
        item={item}
        isExpanded={true}
        onTriage={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
  });

  it("hides triage buttons when isExpanded is false", () => {
    const item = createInboxItem({ title: "Collapsed item" });
    render(
      <InboxItem
        item={item}
        isExpanded={false}
        onTriage={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Move to Next")).not.toBeInTheDocument();
  });

  it("shows triage when expanded regardless of item", () => {
    const item = createInboxItem({ title: "Third item" });
    render(
      <InboxItem
        item={item}
        isExpanded={true}
        onTriage={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
  });

  it("shows subtitle for non-thought capture sources", () => {
    const item = createInboxItem({
      title: "Meeting notes",
      captureSource: { kind: "email", sender: "chef@bund.de" },
    });
    render(
      <InboxItem
        item={item}
        isExpanded={false}
        onTriage={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(screen.getByText("via email")).toBeInTheDocument();
  });

  it("does not show subtitle for thought capture source", () => {
    const item = createInboxItem({ title: "Random thought" });
    render(
      <InboxItem
        item={item}
        isExpanded={false}
        onTriage={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(screen.queryByText(/^via /)).not.toBeInTheDocument();
  });

  it("calls onToggleExpand when title clicked", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const item = createInboxItem({ title: "Clickable item" });
    render(
      <InboxItem
        item={item}
        isExpanded={false}
        onTriage={vi.fn()}
        onToggleExpand={onToggleExpand}
      />,
    );
    await user.click(screen.getByText("Clickable item"));
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });

  it("shows editable input when expanded", () => {
    const item = createInboxItem({ title: "Editable item" });
    render(
      <InboxItem
        item={item}
        isExpanded={true}
        onTriage={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    const input = screen.getByDisplayValue("Editable item");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("calls onUpdateTitle and collapses on Enter", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    const onToggleExpand = vi.fn();
    const item = createInboxItem({ title: "Old title" });
    render(
      <InboxItem
        item={item}
        isExpanded={true}
        onTriage={vi.fn()}
        onToggleExpand={onToggleExpand}
        onUpdateTitle={onUpdateTitle}
      />,
    );
    const input = screen.getByDisplayValue("Old title");
    await user.clear(input);
    await user.type(input, "New title");
    await user.keyboard("{Enter}");
    expect(onUpdateTitle).toHaveBeenCalledWith("New title");
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("does not call onUpdateTitle if title unchanged", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    const item = createInboxItem({ title: "Same title" });
    render(
      <InboxItem
        item={item}
        isExpanded={true}
        onTriage={vi.fn()}
        onToggleExpand={vi.fn()}
        onUpdateTitle={onUpdateTitle}
      />,
    );
    screen.getByDisplayValue("Same title");
    await user.keyboard("{Enter}");
    expect(onUpdateTitle).not.toHaveBeenCalled();
  });

  it("calls onToggleExpand when pencil icon clicked", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const item = createInboxItem({ title: "Edit me" });
    render(
      <InboxItem
        item={item}
        isExpanded={false}
        onTriage={vi.fn()}
        onToggleExpand={onToggleExpand}
      />,
    );
    await user.click(screen.getByLabelText("Edit Edit me"));
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });

  it("reverts and collapses on Escape", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    const onToggleExpand = vi.fn();
    const item = createInboxItem({ title: "Original" });
    render(
      <InboxItem
        item={item}
        isExpanded={true}
        onTriage={vi.fn()}
        onToggleExpand={onToggleExpand}
        onUpdateTitle={onUpdateTitle}
      />,
    );
    const input = screen.getByDisplayValue("Original");
    await user.clear(input);
    await user.type(input, "Changed");
    await user.keyboard("{Escape}");
    expect(onUpdateTitle).not.toHaveBeenCalled();
    expect(onToggleExpand).toHaveBeenCalled();
    expect(input).toHaveValue("Original");
  });
});
