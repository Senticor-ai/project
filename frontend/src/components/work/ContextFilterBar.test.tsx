import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextFilterBar } from "./ContextFilterBar";

const noop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ContextFilterBar", () => {
  it("renders nothing when contexts array is empty", () => {
    const { container } = render(
      <ContextFilterBar
        contexts={[]}
        selectedContexts={[]}
        actionCounts={{}}
        onToggleContext={noop}
        onClearAll={noop}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a chip for each context", () => {
    render(
      <ContextFilterBar
        contexts={["@phone", "@computer", "@office"]}
        selectedContexts={[]}
        actionCounts={{ "@phone": 3, "@computer": 5, "@office": 1 }}
        onToggleContext={noop}
        onClearAll={noop}
      />,
    );
    expect(screen.getByText(/@phone/)).toBeInTheDocument();
    expect(screen.getByText(/@computer/)).toBeInTheDocument();
    expect(screen.getByText(/@office/)).toBeInTheDocument();
  });

  it("shows action count in each chip", () => {
    render(
      <ContextFilterBar
        contexts={["@phone", "@computer"]}
        selectedContexts={[]}
        actionCounts={{ "@phone": 3, "@computer": 5 }}
        onToggleContext={noop}
        onClearAll={noop}
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("chips have unchecked state by default", () => {
    render(
      <ContextFilterBar
        contexts={["@phone"]}
        selectedContexts={[]}
        actionCounts={{ "@phone": 2 }}
        onToggleContext={noop}
        onClearAll={noop}
      />,
    );
    const chip = screen.getByRole("checkbox", { name: /@phone/ });
    expect(chip).toHaveAttribute("aria-checked", "false");
  });

  it("chips show checked state when in selectedContexts", () => {
    render(
      <ContextFilterBar
        contexts={["@phone", "@computer"]}
        selectedContexts={["@phone"]}
        actionCounts={{ "@phone": 2, "@computer": 3 }}
        onToggleContext={noop}
        onClearAll={noop}
      />,
    );
    const phoneChip = screen.getByRole("checkbox", { name: /@phone/ });
    const computerChip = screen.getByRole("checkbox", { name: /@computer/ });
    expect(phoneChip).toHaveAttribute("aria-checked", "true");
    expect(computerChip).toHaveAttribute("aria-checked", "false");
  });

  it("calls onToggleContext when chip is clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <ContextFilterBar
        contexts={["@phone", "@computer"]}
        selectedContexts={[]}
        actionCounts={{ "@phone": 2, "@computer": 3 }}
        onToggleContext={onToggle}
        onClearAll={noop}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: /@phone/ }));
    expect(onToggle).toHaveBeenCalledWith("@phone");
  });

  it("hides Clear button when no contexts are selected", () => {
    render(
      <ContextFilterBar
        contexts={["@phone"]}
        selectedContexts={[]}
        actionCounts={{ "@phone": 2 }}
        onToggleContext={noop}
        onClearAll={noop}
      />,
    );
    expect(
      screen.queryByLabelText("Clear context filters"),
    ).not.toBeInTheDocument();
  });

  it("shows Clear button when contexts are selected", () => {
    render(
      <ContextFilterBar
        contexts={["@phone"]}
        selectedContexts={["@phone"]}
        actionCounts={{ "@phone": 2 }}
        onToggleContext={noop}
        onClearAll={noop}
      />,
    );
    expect(screen.getByLabelText("Clear context filters")).toBeInTheDocument();
  });

  it("calls onClearAll when Clear button is clicked", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <ContextFilterBar
        contexts={["@phone"]}
        selectedContexts={["@phone"]}
        actionCounts={{ "@phone": 2 }}
        onToggleContext={noop}
        onClearAll={onClear}
      />,
    );
    await user.click(screen.getByLabelText("Clear context filters"));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("has accessible group with aria-label", () => {
    render(
      <ContextFilterBar
        contexts={["@phone"]}
        selectedContexts={[]}
        actionCounts={{ "@phone": 2 }}
        onToggleContext={noop}
        onClearAll={noop}
      />,
    );
    expect(
      screen.getByRole("group", { name: "Filter by context" }),
    ).toBeInTheDocument();
  });

  it("each chip has role checkbox", () => {
    render(
      <ContextFilterBar
        contexts={["@phone", "@computer"]}
        selectedContexts={[]}
        actionCounts={{ "@phone": 2, "@computer": 3 }}
        onToggleContext={noop}
        onClearAll={noop}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
  });
});
