import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SwipeableRow, type SwipeIndicatorConfig } from "./SwipeableRow";
import { computeSwipeResult } from "./swipe-utils";

const nextIndicator: SwipeIndicatorConfig = {
  bucket: "next",
  label: "Next Actions",
  icon: "bolt",
  colorClass: "text-app-next",
  bgClass: "bg-app-next/15",
  bgCommitClass: "bg-app-next/30",
  borderClass: "border-app-next/30",
};

const waitingIndicator: SwipeIndicatorConfig = {
  bucket: "waiting",
  label: "Waiting For",
  icon: "schedule",
  colorClass: "text-app-waiting",
  bgClass: "bg-app-waiting/15",
  bgCommitClass: "bg-app-waiting/30",
  borderClass: "border-app-waiting/30",
};

describe("computeSwipeResult", () => {
  const rowWidth = 375;

  it("commits right when offset exceeds 40% of row width", () => {
    expect(computeSwipeResult(160, 0, rowWidth)).toBe("commit-right");
  });

  it("commits left when negative offset exceeds 40% of row width", () => {
    expect(computeSwipeResult(-160, 0, rowWidth)).toBe("commit-left");
  });

  it("cancels when offset is within threshold", () => {
    expect(computeSwipeResult(100, 0, rowWidth)).toBe("cancel");
  });

  it("cancels when negative offset is within threshold", () => {
    expect(computeSwipeResult(-100, 0, rowWidth)).toBe("cancel");
  });

  it("commits right on fast flick regardless of distance", () => {
    expect(computeSwipeResult(30, 850, rowWidth)).toBe("commit-right");
  });

  it("commits left on fast negative flick regardless of distance", () => {
    expect(computeSwipeResult(-30, -850, rowWidth)).toBe("commit-left");
  });

  it("cancels with zero offset and zero velocity", () => {
    expect(computeSwipeResult(0, 0, rowWidth)).toBe("cancel");
  });

  it("commits right at exactly the 40% boundary", () => {
    expect(computeSwipeResult(rowWidth * 0.4, 0, rowWidth)).toBe(
      "commit-right",
    );
  });

  it("does not commit on sub-threshold velocity", () => {
    expect(computeSwipeResult(30, 799, rowWidth)).toBe("cancel");
  });

  it("commits right at exactly 800px/s velocity threshold", () => {
    expect(computeSwipeResult(30, 800, rowWidth)).toBe("commit-right");
  });
});

describe("SwipeableRow", () => {
  it("renders children", () => {
    render(
      <SwipeableRow>
        <div>Test content</div>
      </SwipeableRow>,
    );
    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("renders children when disabled", () => {
    render(
      <SwipeableRow disabled>
        <div>Still visible</div>
      </SwipeableRow>,
    );
    expect(screen.getByText("Still visible")).toBeInTheDocument();
  });

  it("renders indicator labels when not disabled", () => {
    render(
      <SwipeableRow
        rightIndicator={nextIndicator}
        leftIndicator={waitingIndicator}
      >
        <div>Content</div>
      </SwipeableRow>,
    );
    expect(screen.getByText("Next Actions")).toBeInTheDocument();
    expect(screen.getByText("Waiting For")).toBeInTheDocument();
  });

  it("does not render indicators when disabled", () => {
    render(
      <SwipeableRow
        disabled
        rightIndicator={nextIndicator}
        leftIndicator={waitingIndicator}
      >
        <div>Content</div>
      </SwipeableRow>,
    );
    expect(screen.queryByText("Next Actions")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting For")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <SwipeableRow className="custom-class">
        <div>Content</div>
      </SwipeableRow>,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
