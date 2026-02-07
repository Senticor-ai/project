import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BucketBadge } from "./BucketBadge";

describe("BucketBadge", () => {
  it("renders the label for inbox", () => {
    render(<BucketBadge bucket="inbox" />);
    expect(screen.getByText("Inbox")).toBeInTheDocument();
  });

  it("renders the label for next", () => {
    render(<BucketBadge bucket="next" />);
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("hides label when showLabel is false", () => {
    render(<BucketBadge bucket="inbox" showLabel={false} />);
    expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
  });

  it("renders all bucket types without error", () => {
    const buckets = [
      "inbox",
      "next",
      "project",
      "waiting",
      "someday",
      "calendar",
      "reference",
      "focus",
    ] as const;
    for (const bucket of buckets) {
      const { unmount } = render(<BucketBadge bucket={bucket} />);
      unmount();
    }
  });
});
