import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportExportPanel } from "./ImportExportPanel";

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
});
