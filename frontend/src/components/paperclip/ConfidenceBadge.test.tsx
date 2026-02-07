import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceBadge } from "./ConfidenceBadge";

describe("ConfidenceBadge", () => {
  it("shows 'Clarified' label for high confidence", () => {
    render(
      <ConfidenceBadge confidence="high" needsEnrichment={false} showLabel />,
    );
    expect(screen.getByText("Clarified")).toBeInTheDocument();
  });

  it("shows 'Needs review' when needsEnrichment is true", () => {
    render(
      <ConfidenceBadge confidence="low" needsEnrichment={true} showLabel />,
    );
    expect(screen.getByText("Needs review")).toBeInTheDocument();
  });

  it("hides label by default", () => {
    render(<ConfidenceBadge confidence="medium" needsEnrichment={false} />);
    expect(screen.queryByText("Partial")).not.toBeInTheDocument();
  });

  it("shows title attribute for accessibility", () => {
    const { container } = render(
      <ConfidenceBadge confidence="low" needsEnrichment={false} />,
    );
    const span = container.querySelector("[title]");
    expect(span).toHaveAttribute("title", "Raw");
  });
});
