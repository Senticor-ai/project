import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DuplicateImportWarning,
  type PreviousImport,
} from "./DuplicateImportWarning";

const previousImport: PreviousImport = {
  job_id: "job-old",
  status: "completed",
  total: 142,
  created_at: "2025-06-10T14:30:00Z",
};

describe("DuplicateImportWarning", () => {
  it("renders warning with alert role", () => {
    render(
      <DuplicateImportWarning
        previousImport={previousImport}
        onContinue={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows duplicate file message", () => {
    render(
      <DuplicateImportWarning
        previousImport={previousImport}
        onContinue={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText("This file was already imported"),
    ).toBeInTheDocument();
  });

  it("shows previous import details", () => {
    render(
      <DuplicateImportWarning
        previousImport={previousImport}
        onContinue={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/142 items/)).toBeInTheDocument();
    expect(screen.getByText(/completed/)).toBeInTheDocument();
  });

  it("fires onContinue when Import anyway is clicked", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <DuplicateImportWarning
        previousImport={previousImport}
        onContinue={onContinue}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Import anyway"));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("fires onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <DuplicateImportWarning
        previousImport={previousImport}
        onContinue={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
