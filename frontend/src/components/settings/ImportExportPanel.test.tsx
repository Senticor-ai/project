import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportExportPanel } from "./ImportExportPanel";
import type { ImportJobData } from "./ImportJobRow";

describe("ImportExportPanel", () => {
  it("renders import source cards", () => {
    render(<ImportExportPanel onImportNirvana={vi.fn()} onExport={vi.fn()} />);
    expect(screen.getByText("Nirvana")).toBeInTheDocument();
    expect(screen.getByText("Things 3")).toBeInTheDocument();
    expect(screen.getByText("Todoist")).toBeInTheDocument();
    // CSV appears in both import card and export button, check both exist
    expect(screen.getAllByText("CSV")).toHaveLength(2);
  });

  it("shows Nirvana as available with import button", () => {
    render(<ImportExportPanel onImportNirvana={vi.fn()} onExport={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Import from Nirvana" }),
    ).toBeEnabled();
  });

  it("shows coming soon badge for unavailable sources", () => {
    render(<ImportExportPanel onImportNirvana={vi.fn()} onExport={vi.fn()} />);
    const badges = screen.getAllByText("Coming soon");
    expect(badges).toHaveLength(3);
  });

  it("calls onImportNirvana when Nirvana import button is clicked", async () => {
    const user = userEvent.setup();
    const onImportNirvana = vi.fn();
    render(
      <ImportExportPanel
        onImportNirvana={onImportNirvana}
        onExport={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Import from Nirvana" }),
    );
    expect(onImportNirvana).toHaveBeenCalled();
  });

  it("renders export buttons for JSON and CSV", () => {
    render(<ImportExportPanel onImportNirvana={vi.fn()} onExport={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Export as JSON" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export as CSV" }),
    ).toBeInTheDocument();
  });

  it("calls onExport with format when export button is clicked", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<ImportExportPanel onImportNirvana={vi.fn()} onExport={onExport} />);
    await user.click(screen.getByRole("button", { name: "Export as JSON" }));
    expect(onExport).toHaveBeenCalledWith("json");

    await user.click(screen.getByRole("button", { name: "Export as CSV" }));
    expect(onExport).toHaveBeenCalledWith("csv");
  });

  it("does not show import history when no jobs", () => {
    render(<ImportExportPanel onImportNirvana={vi.fn()} onExport={vi.fn()} />);
    expect(screen.queryByText("Recent imports")).not.toBeInTheDocument();
  });

  it("shows import history when jobs are provided", () => {
    const jobs: ImportJobData[] = [
      {
        job_id: "job-1",
        status: "completed",
        source: "nirvana",
        total: 42,
        created_at: "2025-06-15T10:00:00Z",
        started_at: "2025-06-15T10:00:01Z",
        finished_at: "2025-06-15T10:00:20Z",
        summary: {
          total: 42,
          created: 40,
          updated: 2,
          skipped: 0,
          errors: 0,
        },
        error: null,
      },
    ];
    render(
      <ImportExportPanel
        onImportNirvana={vi.fn()}
        onExport={vi.fn()}
        importJobs={jobs}
      />,
    );
    expect(screen.getByText("Recent imports")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("42 items")).toBeInTheDocument();
  });

  it("does not show import history when jobs array is empty", () => {
    render(
      <ImportExportPanel
        onImportNirvana={vi.fn()}
        onExport={vi.fn()}
        importJobs={[]}
      />,
    );
    expect(screen.queryByText("Recent imports")).not.toBeInTheDocument();
  });
});
