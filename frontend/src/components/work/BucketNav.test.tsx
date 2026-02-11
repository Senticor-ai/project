import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BucketNav } from "./BucketNav";

// Mock @dnd-kit/core so useDroppable doesn't need a DndContext provider
vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

describe("BucketNav", () => {
  const defaultProps = {
    activeBucket: "inbox" as const,
    onSelect: vi.fn(),
  };

  it("renders all eight bucket labels", () => {
    render(<BucketNav {...defaultProps} />);
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(screen.getByText("Calendar")).toBeInTheDocument();
    expect(screen.getByText("Later")).toBeInTheDocument();
    expect(screen.getByText("Reference")).toBeInTheDocument();
  });

  it("marks the active bucket with aria-current=page", () => {
    render(<BucketNav {...defaultProps} activeBucket="next" />);
    const nextBtn = screen.getByText("Next").closest("button")!;
    expect(nextBtn).toHaveAttribute("aria-current", "page");

    const inboxBtn = screen.getByText("Inbox").closest("button")!;
    expect(inboxBtn).not.toHaveAttribute("aria-current");
  });

  it("calls onSelect with the bucket when clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<BucketNav {...defaultProps} onSelect={onSelect} />);

    await user.click(screen.getByText("Calendar"));
    expect(onSelect).toHaveBeenCalledWith("calendar");
  });

  it("displays counts when provided", () => {
    render(
      <BucketNav
        {...defaultProps}
        counts={{ inbox: 5, next: 3, reference: 0 }}
      />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    // 0 counts should not render
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders a nav element with accessible label", () => {
    render(<BucketNav {...defaultProps} />);
    expect(
      screen.getByRole("navigation", { name: "Buckets" }),
    ).toBeInTheDocument();
  });
});
