import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportSummaryBreakdown } from "./ImportSummaryBreakdown";

describe("ImportSummaryBreakdown", () => {
  it("shows active counts as total minus completed", () => {
    render(
      <ImportSummaryBreakdown
        bucketCounts={{ next: 100, someday: 20 }}
        completedCounts={{ next: 80, someday: 5 }}
      />,
    );

    const activeSection = screen.getByText(/Active items/);
    expect(activeSection).toHaveTextContent("Active items (35)");

    // Active next = 100 - 80 = 20
    expect(screen.getByText("20")).toBeInTheDocument();
    // Active someday = 20 - 5 = 15
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("shows completed section with correct counts", () => {
    render(
      <ImportSummaryBreakdown
        bucketCounts={{ next: 100, waiting: 10 }}
        completedCounts={{ next: 80, waiting: 10 }}
      />,
    );

    expect(screen.getByText(/Completed/)).toHaveTextContent(
      "Completed / archived (90)",
    );
    expect(screen.getByText("80")).toBeInTheDocument();
  });

  it("always shows inbox in active section even when count is 0", () => {
    render(
      <ImportSummaryBreakdown
        bucketCounts={{ next: 500 }}
        completedCounts={{ next: 500 }}
      />,
    );

    // inbox should appear with 0
    expect(screen.getByText("inbox")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("hides buckets with 0 active and 0 completed", () => {
    render(
      <ImportSummaryBreakdown
        bucketCounts={{ next: 10 }}
        completedCounts={{}}
      />,
    );

    // waiting, calendar, etc. should not appear
    expect(screen.queryByText("waiting")).not.toBeInTheDocument();
    expect(screen.queryByText("calendar")).not.toBeInTheDocument();
  });

  it("does not show completed section when no completed items", () => {
    render(<ImportSummaryBreakdown bucketCounts={{ inbox: 5, next: 10 }} />);

    expect(screen.queryByText(/Completed/)).not.toBeInTheDocument();
  });

  it("fires onBucketClick with bucket name", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <ImportSummaryBreakdown
        bucketCounts={{ inbox: 5, next: 10 }}
        onBucketClick={onClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(onClick).toHaveBeenCalledWith("next");
  });

  it("renders divs (not buttons) when no onBucketClick", () => {
    render(<ImportSummaryBreakdown bucketCounts={{ inbox: 5, next: 10 }} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("handles empty bucket counts gracefully", () => {
    render(<ImportSummaryBreakdown bucketCounts={{}} />);

    expect(screen.getByText(/Active items/)).toHaveTextContent(
      "Active items (0)",
    );
  });

  it("orders buckets consistently", () => {
    render(
      <ImportSummaryBreakdown
        bucketCounts={{
          someday: 5,
          inbox: 3,
          next: 10,
          calendar: 2,
          waiting: 1,
        }}
      />,
    );

    const labels = screen
      .getAllByText(/inbox|next|waiting|calendar|someday/)
      .map((el) => el.textContent);

    expect(labels).toEqual(["inbox", "next", "waiting", "calendar", "someday"]);
  });

  it("shows real-world import data correctly", () => {
    render(
      <ImportSummaryBreakdown
        bucketCounts={{
          next: 19742,
          someday: 498,
          calendar: 15,
          project: 9,
          waiting: 11,
        }}
        completedCounts={{
          next: 19412,
          someday: 2,
          calendar: 1,
          project: 9,
          waiting: 11,
        }}
      />,
    );

    // Active: next=330, someday=496, calendar=14
    // inbox always shown = 0
    expect(screen.getByText(/Active items/)).toHaveTextContent(
      "Active items (840)",
    );
    expect(screen.getByText("330")).toBeInTheDocument();
    expect(screen.getByText("496")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();

    // Completed: next=19412, waiting=11, project=9, someday=2, calendar=1
    expect(screen.getByText(/Completed/)).toHaveTextContent(
      "Completed / archived (19,435)",
    );
  });
});
