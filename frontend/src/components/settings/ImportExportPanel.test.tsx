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
    // CSV only appears in import card now (no CSV export button)
    expect(screen.getAllByText("CSV")).toHaveLength(1);
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

  it("renders single Export JSON button and filter checkboxes", () => {
    render(<ImportExportPanel onImportNirvana={vi.fn()} onExport={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Export JSON" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Include archived")).not.toBeChecked();
    expect(screen.getByLabelText("Include completed")).not.toBeChecked();
    expect(
      screen.queryByRole("button", { name: /CSV/ }),
    ).not.toBeInTheDocument();
  });

  it("calls onExport with default options when export button is clicked", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<ImportExportPanel onImportNirvana={vi.fn()} onExport={onExport} />);
    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(onExport).toHaveBeenCalledWith({
      includeArchived: false,
      includeCompleted: false,
    });
  });

  it("passes toggled filter options to onExport", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<ImportExportPanel onImportNirvana={vi.fn()} onExport={onExport} />);
    await user.click(screen.getByLabelText("Include archived"));
    await user.click(screen.getByLabelText("Include completed"));
    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(onExport).toHaveBeenCalledWith({
      includeArchived: true,
      includeCompleted: true,
    });
  });

  it("can toggle include archived independently", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<ImportExportPanel onImportNirvana={vi.fn()} onExport={onExport} />);
    await user.click(screen.getByLabelText("Include archived"));
    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(onExport).toHaveBeenCalledWith({
      includeArchived: true,
      includeCompleted: false,
    });
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
