import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InboxList } from "./InboxList";
import { createInboxItem, resetFactoryCounter } from "@/model/factories";
import type { InboxItem } from "@/model/gtd-types";

beforeEach(() => {
  resetFactoryCounter();
});

function makeSampleItems(): InboxItem[] {
  return [
    createInboxItem({ title: "Oldest item" }),
    createInboxItem({ title: "Middle item" }),
    createInboxItem({ title: "Newest item" }),
  ];
}

describe("InboxList", () => {
  it("renders Inbox header", () => {
    render(<InboxList items={[]} onCapture={vi.fn()} onTriage={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByText("Capture and clarify")).toBeInTheDocument();
  });

  it("renders all items", () => {
    render(
      <InboxList
        items={makeSampleItems()}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
      />,
    );
    expect(screen.getByText("Oldest item")).toBeInTheDocument();
    expect(screen.getByText("Middle item")).toBeInTheDocument();
    expect(screen.getByText("Newest item")).toBeInTheDocument();
  });

  it("shows empty state when no items", () => {
    render(<InboxList items={[]} onCapture={vi.fn()} onTriage={vi.fn()} />);
    expect(screen.getByText("Inbox is empty")).toBeInTheDocument();
  });

  it("shows triage buttons on expanded item", async () => {
    const user = userEvent.setup();
    render(
      <InboxList
        items={makeSampleItems()}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
      />,
    );
    // Initially no triage buttons visible
    expect(screen.queryByLabelText("Move to Next")).not.toBeInTheDocument();

    // Click the second item to expand it
    await user.click(screen.getByText("Middle item"));
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
  });

  it("collapses previously expanded item when another is clicked", async () => {
    const user = userEvent.setup();
    render(
      <InboxList
        items={makeSampleItems()}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
      />,
    );

    // Expand first item
    await user.click(screen.getByText("Oldest item"));
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();

    // Click second item — first should collapse, second should expand
    await user.click(screen.getByText("Middle item"));
    const nextButtons = screen.getAllByLabelText("Move to Next");
    expect(nextButtons).toHaveLength(1);
  });

  it("collapses item when clicked again", async () => {
    const user = userEvent.setup();
    render(
      <InboxList
        items={makeSampleItems()}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
      />,
    );

    // Expand then collapse via circle icon
    await user.click(screen.getByText("Oldest item"));
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Collapse Oldest item"));
    expect(screen.queryByLabelText("Move to Next")).not.toBeInTheDocument();
  });

  it("any item can be expanded, not just the first", async () => {
    const user = userEvent.setup();
    render(
      <InboxList
        items={makeSampleItems()}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
      />,
    );

    // Expand the last item
    await user.click(screen.getByText("Newest item"));
    expect(screen.getByLabelText("Move to Next")).toBeInTheDocument();
  });

  it("shows item count", () => {
    render(
      <InboxList
        items={makeSampleItems()}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
      />,
    );
    expect(screen.getByText(/3 items to process/)).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Title editing lifecycle
  // -----------------------------------------------------------------------

  it("calls onUpdateTitle when Enter pressed after editing", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    render(
      <InboxList
        items={makeSampleItems()}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
        onUpdateTitle={onUpdateTitle}
      />,
    );

    // Expand to enter edit mode
    await user.click(screen.getByText("Oldest item"));
    const input = screen.getByDisplayValue("Oldest item");
    await user.clear(input);
    await user.type(input, "Renamed item");
    await user.keyboard("{Enter}");

    expect(onUpdateTitle).toHaveBeenCalledOnce();
    expect(onUpdateTitle.mock.calls[0]?.[0].title).toBe("Oldest item");
    expect(onUpdateTitle.mock.calls[0]?.[1]).toBe("Renamed item");
  });

  it("does not call onUpdateTitle when title unchanged on Enter", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    render(
      <InboxList
        items={makeSampleItems()}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
        onUpdateTitle={onUpdateTitle}
      />,
    );

    await user.click(screen.getByText("Oldest item"));
    screen.getByDisplayValue("Oldest item");
    await user.keyboard("{Enter}");

    expect(onUpdateTitle).not.toHaveBeenCalled();
  });

  it("does not call onUpdateTitle on Escape (reverts)", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    render(
      <InboxList
        items={makeSampleItems()}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
        onUpdateTitle={onUpdateTitle}
      />,
    );

    await user.click(screen.getByText("Oldest item"));
    const input = screen.getByDisplayValue("Oldest item");
    await user.clear(input);
    await user.type(input, "Will be reverted");
    await user.keyboard("{Escape}");

    expect(onUpdateTitle).not.toHaveBeenCalled();
  });

  it("auto-saves title on blur when clicking another item", async () => {
    const user = userEvent.setup();
    const onUpdateTitle = vi.fn();
    render(
      <InboxList
        items={makeSampleItems()}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
        onUpdateTitle={onUpdateTitle}
      />,
    );

    // Expand first item and edit
    await user.click(screen.getByText("Oldest item"));
    const input = screen.getByDisplayValue("Oldest item");
    await user.clear(input);
    await user.type(input, "Auto-saved title");

    // Click second item — blur fires on first, saving the edit
    await user.click(screen.getByText("Middle item"));

    expect(onUpdateTitle).toHaveBeenCalledOnce();
    expect(onUpdateTitle.mock.calls[0]?.[1]).toBe("Auto-saved title");

    // Second item should now be expanded
    expect(screen.getByDisplayValue("Middle item")).toBeInTheDocument();
  });

  it("enter saves and collapses, then re-expand shows updated title", async () => {
    const user = userEvent.setup();
    const items = makeSampleItems();
    const onUpdateTitle = vi.fn();

    const { rerender } = render(
      <InboxList
        items={items}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
        onUpdateTitle={onUpdateTitle}
      />,
    );

    // Edit and save via Enter
    await user.click(screen.getByText("Oldest item"));
    const input = screen.getByDisplayValue("Oldest item");
    await user.clear(input);
    await user.type(input, "Updated title");
    await user.keyboard("{Enter}");

    expect(onUpdateTitle).toHaveBeenCalledWith(items[0], "Updated title");

    // Simulate parent applying the title change
    const updatedItems = items.map((item) =>
      item === items[0] ? { ...item, title: "Updated title" } : item,
    );
    rerender(
      <InboxList
        items={updatedItems}
        onCapture={vi.fn()}
        onTriage={vi.fn()}
        onUpdateTitle={onUpdateTitle}
      />,
    );

    // Re-expand — the new title should be shown
    expect(screen.getByText("Updated title")).toBeInTheDocument();
    await user.click(screen.getByText("Updated title"));
    expect(screen.getByDisplayValue("Updated title")).toBeInTheDocument();
  });

  it("calls onTriage when a bucket is clicked on expanded item", async () => {
    const user = userEvent.setup();
    const onTriage = vi.fn();
    render(
      <InboxList
        items={makeSampleItems()}
        onCapture={vi.fn()}
        onTriage={onTriage}
      />,
    );

    // Expand first item then triage
    await user.click(screen.getByText("Oldest item"));
    await user.click(screen.getByLabelText("Move to Next"));
    expect(onTriage).toHaveBeenCalledOnce();
    expect(onTriage.mock.calls[0]?.[0].title).toBe("Oldest item");
    expect(onTriage.mock.calls[0]?.[1].targetBucket).toBe("next");
  });
});
