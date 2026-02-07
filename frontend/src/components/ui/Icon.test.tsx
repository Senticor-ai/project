import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders the icon name as text content", () => {
    render(<Icon name="inbox" />);
    expect(screen.getByText("inbox")).toBeInTheDocument();
  });

  it("applies the material-symbols-outlined class", () => {
    render(<Icon name="bolt" />);
    const el = screen.getByText("bolt");
    expect(el).toHaveClass("material-symbols-outlined");
  });

  it("sets aria-hidden for accessibility", () => {
    render(<Icon name="check_circle" />);
    const el = screen.getByText("check_circle");
    expect(el).toHaveAttribute("aria-hidden", "true");
  });

  it("uses default size of 20px", () => {
    render(<Icon name="inbox" />);
    const el = screen.getByText("inbox");
    expect(el.style.fontSize).toBe("20px");
  });

  it("accepts custom size", () => {
    render(<Icon name="inbox" size={32} />);
    const el = screen.getByText("inbox");
    expect(el.style.fontSize).toBe("32px");
  });

  it("sets FILL 0 by default (outlined)", () => {
    render(<Icon name="inbox" />);
    const el = screen.getByText("inbox");
    expect(el.style.fontVariationSettings).toContain("'FILL' 0");
  });

  it("sets FILL 1 when fill is true", () => {
    render(<Icon name="inbox" fill />);
    const el = screen.getByText("inbox");
    expect(el.style.fontVariationSettings).toContain("'FILL' 1");
  });

  it("passes className through", () => {
    render(<Icon name="inbox" className="text-red-500" />);
    const el = screen.getByText("inbox");
    expect(el).toHaveClass("text-red-500");
  });
});
