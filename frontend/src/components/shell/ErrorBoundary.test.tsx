import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

function ProblemChild(): JSX.Element {
  throw new Error("Boom!");
}

function GoodChild() {
  return <p>All good</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // Suppress React's noisy error logging in test output
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("shows error UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Boom!")).toBeInTheDocument();
  });

  it('"Try again" resets the boundary and re-renders children', async () => {
    let shouldThrow = true;
    function MaybeThrow() {
      if (shouldThrow) throw new Error("Boom!");
      return <p>Recovered</p>;
    }

    render(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    shouldThrow = false;
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });

  it('"Go home" navigates to /workspace/inbox', async () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Go home" }));

    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/workspace/inbox");
    replaceStateSpy.mockRestore();
  });
});
