import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

describe("AutoGrowTextarea", () => {
  it("renders as a textarea", () => {
    render(<AutoGrowTextarea aria-label="Test input" />);
    expect(screen.getByRole("textbox", { name: "Test input" })).toBeInstanceOf(
      HTMLTextAreaElement,
    );
  });

  it("starts with 1 row", () => {
    render(<AutoGrowTextarea aria-label="Test input" />);
    expect(screen.getByRole("textbox", { name: "Test input" })).toHaveAttribute(
      "rows",
      "1",
    );
  });

  it("has resize-none class", () => {
    render(<AutoGrowTextarea aria-label="Test input" />);
    expect(screen.getByRole("textbox", { name: "Test input" })).toHaveClass(
      "resize-none",
    );
  });

  it("calls onSubmit on Enter when submitOnEnter is true", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AutoGrowTextarea
        aria-label="Test input"
        submitOnEnter
        onSubmit={onSubmit}
      />,
    );
    const textarea = screen.getByRole("textbox", { name: "Test input" });
    await user.click(textarea);
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not insert newline on Enter when submitOnEnter is true", async () => {
    const user = userEvent.setup();
    render(
      <AutoGrowTextarea
        aria-label="Test input"
        submitOnEnter
        onSubmit={vi.fn()}
      />,
    );
    const textarea = screen.getByRole("textbox", {
      name: "Test input",
    }) as HTMLTextAreaElement;
    await user.type(textarea, "hello{Enter}");
    expect(textarea.value).toBe("hello");
  });

  it("inserts newline on Shift+Enter when submitOnEnter is true", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AutoGrowTextarea
        aria-label="Test input"
        submitOnEnter
        onSubmit={onSubmit}
      />,
    );
    const textarea = screen.getByRole("textbox", {
      name: "Test input",
    }) as HTMLTextAreaElement;
    await user.type(textarea, "line1{Shift>}{Enter}{/Shift}line2");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea.value).toContain("line1");
    expect(textarea.value).toContain("line2");
  });

  it("inserts newline on Alt+Enter when submitOnEnter is true", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AutoGrowTextarea
        aria-label="Test input"
        submitOnEnter
        onSubmit={onSubmit}
      />,
    );
    const textarea = screen.getByRole("textbox", {
      name: "Test input",
    }) as HTMLTextAreaElement;
    await user.type(textarea, "line1{Alt>}{Enter}{/Alt}line2");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea.value).toContain("line1");
    expect(textarea.value).toContain("line2");
  });

  it("allows Enter to insert newline when submitOnEnter is false", async () => {
    const user = userEvent.setup();
    render(<AutoGrowTextarea aria-label="Test input" submitOnEnter={false} />);
    const textarea = screen.getByRole("textbox", {
      name: "Test input",
    }) as HTMLTextAreaElement;
    await user.type(textarea, "line1{Enter}line2");
    expect(textarea.value).toContain("line1");
    expect(textarea.value).toContain("line2");
  });

  it("passes through additional className", () => {
    render(
      <AutoGrowTextarea aria-label="Test input" className="custom-class" />,
    );
    const textarea = screen.getByRole("textbox", { name: "Test input" });
    expect(textarea).toHaveClass("custom-class");
    expect(textarea).toHaveClass("resize-none");
  });

  it("passes through placeholder", () => {
    render(
      <AutoGrowTextarea aria-label="Test input" placeholder="Type here..." />,
    );
    expect(screen.getByPlaceholderText("Type here...")).toBeInTheDocument();
  });
});
