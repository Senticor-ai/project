import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeveloperPanel } from "./DeveloperPanel";

describe("DeveloperPanel", () => {
  it("renders the flush button", () => {
    render(<DeveloperPanel />);
    expect(
      screen.getByRole("button", { name: /flush all data/i }),
    ).toBeInTheDocument();
  });

  it("shows confirmation input after clicking flush", async () => {
    const user = userEvent.setup();
    render(<DeveloperPanel />);

    await user.click(screen.getByRole("button", { name: /flush all data/i }));

    expect(screen.getByLabelText(/type flush to confirm/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirm flush/i }),
    ).toBeDisabled();
  });

  it("enables confirm button only when user types FLUSH", async () => {
    const user = userEvent.setup();
    render(<DeveloperPanel />);

    await user.click(screen.getByRole("button", { name: /flush all data/i }));

    const input = screen.getByLabelText(/type flush to confirm/i);
    await user.type(input, "FLUS");
    expect(
      screen.getByRole("button", { name: /confirm flush/i }),
    ).toBeDisabled();

    await user.type(input, "H");
    expect(
      screen.getByRole("button", { name: /confirm flush/i }),
    ).toBeEnabled();
  });

  it("calls onFlush when confirmed and shows result", async () => {
    const user = userEvent.setup();
    const onFlush = vi.fn().mockResolvedValue({
      ok: true,
      deleted: { items: 42, assertions: 5, files: 3 },
    });
    render(<DeveloperPanel onFlush={onFlush} />);

    await user.click(screen.getByRole("button", { name: /flush all data/i }));
    await user.type(screen.getByLabelText(/type flush to confirm/i), "FLUSH");
    await user.click(screen.getByRole("button", { name: /confirm flush/i }));

    expect(onFlush).toHaveBeenCalledOnce();

    // After flush completes, result should be shown
    expect(await screen.findByText(/items: 42/)).toBeInTheDocument();
  });

  it("shows error message when flush fails", async () => {
    const user = userEvent.setup();
    const onFlush = vi.fn().mockRejectedValue(new Error("Server error"));
    render(<DeveloperPanel onFlush={onFlush} />);

    await user.click(screen.getByRole("button", { name: /flush all data/i }));
    await user.type(screen.getByLabelText(/type flush to confirm/i), "FLUSH");
    await user.click(screen.getByRole("button", { name: /confirm flush/i }));

    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
  });

  it("allows cancelling the confirmation", async () => {
    const user = userEvent.setup();
    render(<DeveloperPanel />);

    await user.click(screen.getByRole("button", { name: /flush all data/i }));
    expect(screen.getByLabelText(/type flush to confirm/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(
      screen.queryByLabelText(/type flush to confirm/i),
    ).not.toBeInTheDocument();
  });
});
