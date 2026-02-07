import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InboxCapture } from "./InboxCapture";

describe("InboxCapture", () => {
  it("renders the input field", () => {
    render(<InboxCapture onCapture={vi.fn()} />);
    expect(screen.getByLabelText("Capture inbox item")).toBeInTheDocument();
  });

  it("shows capture button when text is entered", async () => {
    const user = userEvent.setup();
    render(<InboxCapture onCapture={vi.fn()} />);

    const input = screen.getByLabelText("Capture inbox item");
    await user.type(input, "New thought");
    expect(screen.getByText("Capture")).toBeInTheDocument();
  });

  it("hides capture button when input is empty", () => {
    render(<InboxCapture onCapture={vi.fn()} />);
    expect(screen.queryByText("Capture")).not.toBeInTheDocument();
  });

  it("calls onCapture on Enter key", async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn();
    render(<InboxCapture onCapture={onCapture} />);

    const input = screen.getByLabelText("Capture inbox item");
    await user.type(input, "Anruf bei Frau Müller{Enter}");
    expect(onCapture).toHaveBeenCalledWith("Anruf bei Frau Müller");
  });

  it("clears input after capture", async () => {
    const user = userEvent.setup();
    render(<InboxCapture onCapture={vi.fn()} />);

    const input = screen.getByLabelText("Capture inbox item");
    await user.type(input, "Test{Enter}");
    expect(input).toHaveValue("");
  });

  it("does not capture whitespace-only text", async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn();
    render(<InboxCapture onCapture={onCapture} />);

    const input = screen.getByLabelText("Capture inbox item");
    await user.type(input, "   {Enter}");
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("calls onCapture on button click", async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn();
    render(<InboxCapture onCapture={onCapture} />);

    const input = screen.getByLabelText("Capture inbox item");
    await user.type(input, "Click test");
    await user.click(screen.getByText("Capture"));
    expect(onCapture).toHaveBeenCalledWith("Click test");
  });
});
