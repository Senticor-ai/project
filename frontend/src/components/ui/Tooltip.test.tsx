import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "./Tooltip";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Tooltip", () => {
  it("renders children without tooltip when no label available", () => {
    render(
      <Tooltip>
        <button>Click</button>
      </Tooltip>,
    );
    expect(screen.getByText("Click")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("derives label from child's aria-label", async () => {
    render(
      <Tooltip>
        <button aria-label="Archive project">
          <span>icon</span>
        </button>
      </Tooltip>,
    );

    const trigger = screen.getByLabelText("Archive project").closest("span")!;
    await userEvent.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByRole("tooltip")).toHaveTextContent("Archive project");
  });

  it("uses explicit label prop over aria-label", async () => {
    render(
      <Tooltip label="Custom label">
        <button aria-label="Archive project">
          <span>icon</span>
        </button>
      </Tooltip>,
    );

    const trigger = screen.getByLabelText("Archive project").closest("span")!;
    await userEvent.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByRole("tooltip")).toHaveTextContent("Custom label");
  });

  it("shows tooltip after hover delay", async () => {
    render(
      <Tooltip label="Help">
        <button>btn</button>
      </Tooltip>,
    );

    const trigger = screen.getByText("btn").closest("span")!;
    await userEvent.hover(trigger);

    // Not visible immediately
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Visible after delay
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Help");
  });

  it("hides tooltip on mouse leave", async () => {
    render(
      <Tooltip label="Help">
        <button>btn</button>
      </Tooltip>,
    );

    const trigger = screen.getByText("btn").closest("span")!;
    await userEvent.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await userEvent.unhover(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("cancels show if mouse leaves before delay", async () => {
    render(
      <Tooltip label="Help">
        <button>btn</button>
      </Tooltip>,
    );

    const trigger = screen.getByText("btn").closest("span")!;
    await userEvent.hover(trigger);

    // Leave before delay fires
    act(() => {
      vi.advanceTimersByTime(200);
    });
    await userEvent.unhover(trigger);

    // Advance past the original delay
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("clears older timer when show is triggered again", async () => {
    render(
      <Tooltip label="Help">
        <button>btn</button>
      </Tooltip>,
    );

    const trigger = screen.getByText("btn").closest("span")!;
    const button = screen.getByText("btn");

    await userEvent.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Focus schedules show again; the previous timer should be replaced.
    act(() => {
      button.focus();
    });

    await userEvent.unhover(trigger);
    act(() => {
      button.blur();
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows tooltip on focus and hides on blur", async () => {
    render(
      <Tooltip label="Help">
        <button>btn</button>
      </Tooltip>,
    );

    const button = screen.getByText("btn");
    act(() => {
      button.focus();
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Help");

    act(() => {
      button.blur();
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("sets role=tooltip on the tooltip element", async () => {
    render(
      <Tooltip label="Info">
        <button>btn</button>
      </Tooltip>,
    );

    const trigger = screen.getByText("btn").closest("span")!;
    await userEvent.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toBeInTheDocument();
  });

  it("respects custom delay", async () => {
    render(
      <Tooltip label="Fast" delay={100}>
        <button>btn</button>
      </Tooltip>,
    );

    const trigger = screen.getByText("btn").closest("span")!;
    await userEvent.hover(trigger);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Fast");
  });
});
