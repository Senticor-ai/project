import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownViewer } from "./MarkdownViewer";

describe("MarkdownViewer", () => {
  it("renders plain text", () => {
    render(<MarkdownViewer content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders headings", () => {
    render(<MarkdownViewer content="# Main Heading" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Main Heading" }),
    ).toBeInTheDocument();
  });

  it("renders bold text", () => {
    render(<MarkdownViewer content="This is **bold** text" />);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("renders links", () => {
    render(<MarkdownViewer content="[Example](https://example.com)" />);
    const link = screen.getByRole("link", { name: "Example" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders unordered lists", () => {
    render(<MarkdownViewer content={"- Item A\n- Item B\n- Item C"} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("renders GFM tables", () => {
    const table = `
| Name | Role |
|------|------|
| Alice | Dev |
| Bob | PM |
`;
    render(<MarkdownViewer content={table} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 data rows
  });

  it("applies custom className", () => {
    const { container } = render(
      <MarkdownViewer content="test" className="my-custom-class" />,
    );
    expect(container.firstChild).toHaveClass("my-custom-class");
  });

  it("applies markdown-prose class by default", () => {
    const { container } = render(<MarkdownViewer content="test" />);
    expect(container.firstChild).toHaveClass("markdown-prose");
  });

  it("renders empty content without crashing", () => {
    const { container } = render(<MarkdownViewer content="" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
