import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "./ChatInput";

describe("ChatInput", () => {
  it("renders a textarea with placeholder", () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(
      screen.getByRole("textbox", { name: "Nachricht an Tay" }),
    ).toBeInTheDocument();
  });

  it("renders a send button", () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Senden" })).toBeInTheDocument();
  });

  it("calls onSend with trimmed text on Enter", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByRole("textbox", { name: "Nachricht an Tay" });
    await user.type(textarea, "Hello Tay{Enter}");

    expect(onSend).toHaveBeenCalledWith("Hello Tay");
  });

  it("clears the input after sending", async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} />);

    const textarea = screen.getByRole("textbox", {
      name: "Nachricht an Tay",
    }) as HTMLTextAreaElement;
    await user.type(textarea, "Hello{Enter}");

    expect(textarea.value).toBe("");
  });

  it("does not send empty or whitespace-only messages", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByRole("textbox", { name: "Nachricht an Tay" });
    await user.type(textarea, "   {Enter}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("calls onSend when clicking the send button", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByRole("textbox", { name: "Nachricht an Tay" });
    await user.type(textarea, "Hello Tay");
    await user.click(screen.getByRole("button", { name: "Senden" }));

    expect(onSend).toHaveBeenCalledWith("Hello Tay");
  });

  it("allows multiline with Shift+Enter", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByRole("textbox", {
      name: "Nachricht an Tay",
    }) as HTMLTextAreaElement;
    await user.type(textarea, "line1{Shift>}{Enter}{/Shift}line2");

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea.value).toContain("line1");
    expect(textarea.value).toContain("line2");
  });

  it("disables input and button when disabled prop is true", () => {
    render(<ChatInput onSend={vi.fn()} disabled />);

    expect(
      screen.getByRole("textbox", { name: "Nachricht an Tay" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Senden" })).toBeDisabled();
  });

  it("disables send button when input is empty", () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Senden" })).toBeDisabled();
  });
});
