import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnergyFilterBar } from "./EnergyFilterBar";

const noop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EnergyFilterBar", () => {
  it("renders three energy level buttons", () => {
    render(<EnergyFilterBar selectedEnergy={null} onToggleEnergy={noop} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("has accessible group with aria-label", () => {
    render(<EnergyFilterBar selectedEnergy={null} onToggleEnergy={noop} />);
    expect(
      screen.getByRole("group", { name: "Filter by energy" }),
    ).toBeInTheDocument();
  });

  it("all buttons unchecked when selectedEnergy is null", () => {
    render(<EnergyFilterBar selectedEnergy={null} onToggleEnergy={noop} />);
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-checked", "false");
    }
  });

  it("marks selected energy as checked", () => {
    render(<EnergyFilterBar selectedEnergy="medium" onToggleEnergy={noop} />);
    expect(screen.getByRole("radio", { name: "medium" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "low" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "high" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("calls onToggleEnergy with level when clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<EnergyFilterBar selectedEnergy={null} onToggleEnergy={onToggle} />);
    await user.click(screen.getByRole("radio", { name: "high" }));
    expect(onToggle).toHaveBeenCalledWith("high");
  });

  it("calls onToggleEnergy with selected level to deselect", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<EnergyFilterBar selectedEnergy="low" onToggleEnergy={onToggle} />);
    await user.click(screen.getByRole("radio", { name: "low" }));
    expect(onToggle).toHaveBeenCalledWith("low");
  });

  it("renders low, medium, high labels", () => {
    render(<EnergyFilterBar selectedEnergy={null} onToggleEnergy={noop} />);
    expect(screen.getByText("low")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("applies className prop", () => {
    render(
      <EnergyFilterBar
        selectedEnergy={null}
        onToggleEnergy={noop}
        className="mt-2"
      />,
    );
    const group = screen.getByRole("group", { name: "Filter by energy" });
    expect(group.className).toContain("mt-2");
  });
});
