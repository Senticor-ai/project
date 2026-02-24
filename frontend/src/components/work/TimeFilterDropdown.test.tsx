import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeFilterDropdown } from "./TimeFilterDropdown";

const noop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TimeFilterDropdown", () => {
  it("renders a labelled select with schedule icon", () => {
    render(<TimeFilterDropdown maxTimeEstimate={null} onChangeMaxTime={noop} />);
    expect(screen.getByLabelText("Time available")).toBeInTheDocument();
  });

  it("has 'Any time' as the default option with empty value", () => {
    render(<TimeFilterDropdown maxTimeEstimate={null} onChangeMaxTime={noop} />);
    const select = screen.getByLabelText("Time available") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByText("Any time")).toBeInTheDocument();
  });

  it("shows all time estimate options", () => {
    render(<TimeFilterDropdown maxTimeEstimate={null} onChangeMaxTime={noop} />);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(7); // Any time + 6 estimates
    expect(options.map((o) => o.textContent)).toEqual([
      "Any time",
      "5 min",
      "15 min",
      "30 min",
      "1 hr",
      "2 hr",
      "Half day",
    ]);
  });

  it("reflects the current maxTimeEstimate value", () => {
    render(
      <TimeFilterDropdown maxTimeEstimate="30min" onChangeMaxTime={noop} />,
    );
    const select = screen.getByLabelText("Time available") as HTMLSelectElement;
    expect(select.value).toBe("30min");
  });

  it("calls onChangeMaxTime with TimeEstimate when option selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TimeFilterDropdown maxTimeEstimate={null} onChangeMaxTime={onChange} />,
    );
    await user.selectOptions(screen.getByLabelText("Time available"), "15min");
    expect(onChange).toHaveBeenCalledWith("15min");
  });

  it("calls onChangeMaxTime with null when 'Any time' selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TimeFilterDropdown maxTimeEstimate="30min" onChangeMaxTime={onChange} />,
    );
    await user.selectOptions(screen.getByLabelText("Time available"), "");
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("applies className prop", () => {
    const { container } = render(
      <TimeFilterDropdown
        maxTimeEstimate={null}
        onChangeMaxTime={noop}
        className="custom-class"
      />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
