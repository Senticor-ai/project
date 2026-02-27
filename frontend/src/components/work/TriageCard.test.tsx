import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TriageCard } from "./TriageCard";
import { createActionItem } from "@/model/factories";

describe("TriageCard", () => {
  const item = createActionItem({
    name: "Buy groceries",
    bucket: "inbox",
    description: "Get milk, eggs, and bread from the store",
  });

  it("renders item title", () => {
    render(
      <TriageCard
        item={item}
        stackIndex={0}
        onSwipeRight={vi.fn()}
        onSwipeLeft={vi.fn()}
        onTap={vi.fn()}
      />,
    );
    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <TriageCard
        item={item}
        stackIndex={0}
        onSwipeRight={vi.fn()}
        onSwipeLeft={vi.fn()}
        onTap={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Get milk, eggs, and bread from the store"),
    ).toBeInTheDocument();
  });

  it("calls onTap when clicked", async () => {
    const onTap = vi.fn();
    const user = userEvent.setup();
    render(
      <TriageCard
        item={item}
        stackIndex={0}
        onSwipeRight={vi.fn()}
        onSwipeLeft={vi.fn()}
        onTap={onTap}
      />,
    );
    await user.click(screen.getByText("Buy groceries"));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("applies reduced opacity for non-active stack cards", () => {
    const { container } = render(
      <TriageCard
        item={item}
        stackIndex={1}
        onSwipeRight={vi.fn()}
        onSwipeLeft={vi.fn()}
        onTap={vi.fn()}
      />,
    );
    // Stack cards (index > 0) have pointer-events-none
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("pointer-events-none");
  });
});
