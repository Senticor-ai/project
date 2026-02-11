import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  progress: null,
  error: null,
};

describe("ImportJobRow", () => {
  it("renders source and item count from summary", () => {
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
    expect(errorSpan?.parentElement?.className).toContain("text-status-error");
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

  it("shows 'importing...' instead of '0 items' while running without progress", () => {
    const running: ImportJobData = {
      ...baseJob,
      status: "running",
      finished_at: null,
      summary: null,
    };
    render(<ImportJobRow job={running} />);
    expect(screen.getByText("importing...")).toBeInTheDocument();
  });

  it("shows progress count while running with progress", () => {
    const running: ImportJobData = {
      ...baseJob,
      status: "running",
      finished_at: null,
      summary: null,
      progress: { processed: 42, total: 150 },
    };
    render(<ImportJobRow job={running} />);
    expect(screen.getByText("42 / 150 items")).toBeInTheDocument();
    expect(screen.queryByText("importing...")).not.toBeInTheDocument();
  });

  it("shows running stats when progress includes counts", () => {
    const running: ImportJobData = {
      ...baseJob,
      status: "running",
      finished_at: null,
      summary: null,
      progress: {
        processed: 42,
        total: 150,
        created: 30,
        updated: 8,
        skipped: 3,
        errors: 1,
      },
    };
    render(<ImportJobRow job={running} />);
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("created")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("updated")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("skipped")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    const errorSpan = screen.getByText("1").closest("span");
    expect(errorSpan?.parentElement?.className).toContain("text-status-error");
  });

  it("shows 'importing...' instead of '0 items' while queued", () => {
    const queued: ImportJobData = {
      ...baseJob,
      status: "queued",
      started_at: null,
      finished_at: null,
      summary: null,
    };
    render(<ImportJobRow job={queued} />);
    expect(screen.getByText("importing...")).toBeInTheDocument();
    expect(screen.queryByText(/items/)).not.toBeInTheDocument();
  });

  it("shows elapsed time immediately on first render (no flash)", () => {
    const running: ImportJobData = {
      ...baseJob,
      status: "running",
      started_at: new Date(Date.now() - 65_000).toISOString(),
      finished_at: null,
      summary: null,
    };
    render(<ImportJobRow job={running} />);
    // Elapsed time is computed synchronously — no waitFor needed
    expect(screen.getByText(/Running for 1m/)).toBeInTheDocument();
  });

  it("shows elapsed time immediately while queued (no flash)", () => {
    const queued: ImportJobData = {
      ...baseJob,
      status: "queued",
      started_at: null,
      finished_at: null,
      summary: null,
      created_at: new Date(Date.now() - 30_000).toISOString(),
    };
    render(<ImportJobRow job={queued} />);
    // Elapsed time is computed synchronously — no waitFor needed
    expect(screen.getByText(/Queued for/)).toBeInTheDocument();
  });

  it("shows retry and dismiss buttons on failed jobs", () => {
    const failed: ImportJobData = {
      ...baseJob,
      status: "failed",
      summary: null,
      error: "Timeout",
    };
    render(<ImportJobRow job={failed} onRetry={vi.fn()} onArchive={vi.fn()} />);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /dismiss/i }),
    ).toBeInTheDocument();
  });

  it("shows dismiss button on completed jobs (no retry)", () => {
    render(
      <ImportJobRow job={baseJob} onRetry={vi.fn()} onArchive={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: /dismiss/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show buttons on running/queued jobs", () => {
    const running: ImportJobData = {
      ...baseJob,
      status: "running",
      finished_at: null,
      summary: null,
    };
    render(
      <ImportJobRow job={running} onRetry={vi.fn()} onArchive={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dismiss/i }),
    ).not.toBeInTheDocument();
  });

  it("retry button calls onRetry with job_id", async () => {
    const onRetry = vi.fn();
    const failed: ImportJobData = {
      ...baseJob,
      status: "failed",
      summary: null,
      error: "Timeout",
    };
    render(<ImportJobRow job={failed} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledWith("job-1");
  });

  it("dismiss button calls onArchive with job_id", async () => {
    const onArchive = vi.fn();
    const failed: ImportJobData = {
      ...baseJob,
      status: "failed",
      summary: null,
      error: "Timeout",
    };
    render(<ImportJobRow job={failed} onArchive={onArchive} />);

    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onArchive).toHaveBeenCalledWith("job-1");
  });

  it("retry button is disabled when isRetrying", () => {
    const failed: ImportJobData = {
      ...baseJob,
      status: "failed",
      summary: null,
      error: "Timeout",
    };
    render(<ImportJobRow job={failed} onRetry={vi.fn()} isRetrying />);
    expect(screen.getByRole("button", { name: /retry/i })).toBeDisabled();
  });

  it("does not show buttons when callbacks are not provided", () => {
    const failed: ImportJobData = {
      ...baseJob,
      status: "failed",
      summary: null,
      error: "Timeout",
    };
    render(<ImportJobRow job={failed} />);
    expect(
      screen.queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dismiss/i }),
    ).not.toBeInTheDocument();
  });
});
