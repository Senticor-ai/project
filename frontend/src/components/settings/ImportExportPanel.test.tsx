import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportExportPanel } from "./ImportExportPanel";
import type { ImportJobData } from "./ImportJobRow";

const defaultProps = {
  onImportNative: vi.fn(),
  onImportNirvana: vi.fn(),
  onExport: vi.fn(),
};

describe("ImportExportPanel", () => {
  it("renders import source cards", () => {
    render(<ImportExportPanel {...defaultProps} />);
    expect(screen.getByText("TerminAndoYo")).toBeInTheDocument();
    expect(screen.getByText("Nirvana")).toBeInTheDocument();
  });

  it("shows TerminAndoYo as available with import button", () => {
    render(<ImportExportPanel {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "Import from TerminAndoYo" }),
    ).toBeEnabled();
  });

  it("shows Nirvana as available with import button", () => {
    render(<ImportExportPanel {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "Import from Nirvana" }),
    ).toBeEnabled();
  });

  it("does not show coming soon badges", () => {
    render(<ImportExportPanel {...defaultProps} />);
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });

  it("calls onImportNative when TerminAndoYo import button is clicked", async () => {
    const user = userEvent.setup();
    const onImportNative = vi.fn();
    render(
      <ImportExportPanel {...defaultProps} onImportNative={onImportNative} />,
    );
    await user.click(
      screen.getByRole("button", { name: "Import from TerminAndoYo" }),
    );
    expect(onImportNative).toHaveBeenCalled();
  });

  it("calls onImportNirvana when Nirvana import button is clicked", async () => {
    const user = userEvent.setup();
    const onImportNirvana = vi.fn();
    render(
      <ImportExportPanel {...defaultProps} onImportNirvana={onImportNirvana} />,
    );
    await user.click(
      screen.getByRole("button", { name: "Import from Nirvana" }),
    );
    expect(onImportNirvana).toHaveBeenCalled();
  });

  it("renders single Export JSON button and filter checkboxes", () => {
    render(<ImportExportPanel {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "Export JSON" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Include archived")).not.toBeChecked();
    expect(screen.getByLabelText("Include completed")).not.toBeChecked();
    expect(screen.queryByText("CSV")).not.toBeInTheDocument();
  });

  it("calls onExport with default options when export button is clicked", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<ImportExportPanel {...defaultProps} onExport={onExport} />);
    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(onExport).toHaveBeenCalledWith({
      includeArchived: false,
      includeCompleted: false,
    });
  });

  it("passes toggled filter options to onExport", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<ImportExportPanel {...defaultProps} onExport={onExport} />);
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
    render(<ImportExportPanel {...defaultProps} onExport={onExport} />);
    await user.click(screen.getByLabelText("Include archived"));
    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(onExport).toHaveBeenCalledWith({
      includeArchived: true,
      includeCompleted: false,
    });
  });

  it("does not show import history when no jobs", () => {
    render(<ImportExportPanel {...defaultProps} />);
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
        progress: null,
        error: null,
      },
    ];
    render(<ImportExportPanel {...defaultProps} importJobs={jobs} />);
    expect(screen.getByText("Recent imports")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("42 items")).toBeInTheDocument();
  });

  it("does not show import history when jobs array is empty", () => {
    render(<ImportExportPanel {...defaultProps} importJobs={[]} />);
    expect(screen.queryByText("Recent imports")).not.toBeInTheDocument();
  });
});
