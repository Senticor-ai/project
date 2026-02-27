import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TriageSheet } from "./TriageSheet";

describe("TriageSheet", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onMove: vi.fn(),
    onArchive: vi.fn(),
    itemName: "Buy groceries",
  };

  it("renders bucket buttons when open", () => {
    render(<TriageSheet {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /Next/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Waiting/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Calendar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Later/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Reference/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Archive/i }),
    ).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(<TriageSheet {...defaultProps} isOpen={false} />);
    expect(
      screen.queryByRole("button", { name: /Next/i }),
    ).not.toBeInTheDocument();
  });

  it("calls onMove with bucket when a bucket button is clicked", async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<TriageSheet {...defaultProps} onMove={onMove} />);

    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(onMove).toHaveBeenCalledWith("next");
  });

  it("calls onArchive when archive button is clicked", async () => {
    const onArchive = vi.fn();
    const user = userEvent.setup();
    render(<TriageSheet {...defaultProps} onArchive={onArchive} />);

    await user.click(screen.getByRole("button", { name: /Archive/i }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TriageSheet {...defaultProps} onClose={onClose} />);

    const backdrop = screen.getByTestId("triage-sheet-backdrop");
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("displays item name in the header", () => {
    render(<TriageSheet {...defaultProps} />);
    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
  });
});
