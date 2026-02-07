import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportJobRow, type ImportJobData } from "./ImportJobRow";

const baseJob: ImportJobData = {
  job_id: "job-1",
  status: "completed",
  source: "nirvana",
  total: 142,
  created_at: "2025-06-15T10:00:00Z",
  started_at: "2025-06-15T10:00:01Z",
  finished_at: "2025-06-15T10:00:45Z",
  summary: {
    total: 142,
    created: 120,
    updated: 15,
    skipped: 5,
    errors: 2,
  },
  error: null,
};

describe("ImportJobRow", () => {
  it("renders source and item count", () => {
    render(<ImportJobRow job={baseJob} />);
    expect(screen.getByText("nirvana")).toBeInTheDocument();
    expect(screen.getByText("142 items")).toBeInTheDocument();
  });

  it("shows completed status with check icon", () => {
    render(<ImportJobRow job={baseJob} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("check_circle")).toBeInTheDocument();
  });

  it("shows summary counts when completed", () => {
    render(<ImportJobRow job={baseJob} />);
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("created")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("updated")).toBeInTheDocument();
  });

  it("shows error count in red when errors > 0", () => {
    render(<ImportJobRow job={baseJob} />);
    const errorSpan = screen.getByText("2").closest("span");
    expect(errorSpan?.parentElement?.className).toContain("text-red-600");
  });

  it("renders queued status correctly", () => {
    const queued: ImportJobData = {
      ...baseJob,
      status: "queued",
      started_at: null,
      finished_at: null,
      summary: null,
    };
    render(<ImportJobRow job={queued} />);
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("hourglass_empty")).toBeInTheDocument();
  });

  it("renders running status with spin animation", () => {
    const running: ImportJobData = {
      ...baseJob,
      status: "running",
      finished_at: null,
      summary: null,
    };
    render(<ImportJobRow job={running} />);
    expect(screen.getByText("Running")).toBeInTheDocument();
    const icon = screen.getByText("sync");
    expect(icon.className).toContain("animate-spin");
  });

  it("renders failed status with error message", () => {
    const failed: ImportJobData = {
      ...baseJob,
      status: "failed",
      summary: null,
      error: "Connection timeout after 30s",
    };
    render(<ImportJobRow job={failed} />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(
      screen.getByText("Connection timeout after 30s"),
    ).toBeInTheDocument();
  });

  it("shows timestamps for completed job", () => {
    render(<ImportJobRow job={baseJob} />);
    // Should show started and finished times
    expect(screen.getByText(/Started/)).toBeInTheDocument();
    expect(screen.getByText(/Finished/)).toBeInTheDocument();
  });

  it("does not show summary counts when not completed", () => {
    const running: ImportJobData = {
      ...baseJob,
      status: "running",
      finished_at: null,
      summary: null,
    };
    render(<ImportJobRow job={running} />);
    expect(screen.queryByText("created")).not.toBeInTheDocument();
  });

  it("hides error count when errors is 0", () => {
    const noErrors: ImportJobData = {
      ...baseJob,
      summary: { ...baseJob.summary!, errors: 0 },
    };
    render(<ImportJobRow job={noErrors} />);
    expect(screen.queryByText("errors")).not.toBeInTheDocument();
  });
});
