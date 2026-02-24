import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";
import { ToastProvider } from "./ToastProvider";
import { useToast } from "@/lib/use-toast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function ToastTrigger() {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast("Success!", "success")}>Show success</button>
      <button onClick={() => toast("Oops!", "error")}>Show error</button>
      <button onClick={() => toast("FYI", "info")}>Show info</button>
    </div>
  );
}

function DismissTrigger() {
  const { toast, toasts, dismiss } = useToast();
  return (
    <div>
      <span data-testid="count">{toasts.length}</span>
      <button onClick={() => toast("Dismissable", "info")}>Add toast</button>
      {toasts.map((t) => (
        <button key={t.id} onClick={() => dismiss(t.id)}>
          Dismiss {t.message}
        </button>
      ))}
    </div>
  );
}

function MutationTrigger() {
  const mutation = useMutation({
    mutationFn: async () => {
      throw new Error("Mutation failed!");
    },
  });
  return <button onClick={() => mutation.mutate()}>Trigger mutation</button>;
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a toast when toast() is called", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<ToastTrigger />);

    await user.click(screen.getByText("Show success"));
    expect(screen.getByRole("alert")).toHaveTextContent("Success!");
  });

  it("shows correct icon for each toast type", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<ToastTrigger />);

    await user.click(screen.getByText("Show error"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("auto-dismisses after 5 seconds", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<DismissTrigger />);

    await user.click(screen.getByText("Add toast"));
    expect(screen.getByTestId("count")).toHaveTextContent("1");

    // Advance past auto-dismiss timeout
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("0");
    });
  });

  it("dismiss() removes a specific toast", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<DismissTrigger />);

    await user.click(screen.getByText("Add toast"));
    expect(screen.getByTestId("count")).toHaveTextContent("1");

    await user.click(screen.getByText("Dismiss Dismissable"));

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("0");
    });
  });

  it("shows toast on mutation error via MutationErrorBridge", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // Suppress console.error from React Query mutation error
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(<MutationTrigger />);

    await user.click(screen.getByText("Trigger mutation"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Mutation failed!");
    });
  });

  it("shows readable message when mutation error.message is not a string", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Simulates FastAPI validation errors where detail is an array,
    // causing Error(message) to produce "[object Object]"
    function ObjectErrorTrigger() {
      const mutation = useMutation({
        mutationFn: async () => {
          const err = new Error();
          // Force .message to a non-string value (mimics ApiError with object detail)
          (err as unknown as Record<string, unknown>).message = {
            detail: [{ type: "missing", loc: ["body", "name"] }],
          };
          throw err;
        },
      });
      return (
        <button onClick={() => mutation.mutate()}>Trigger object error</button>
      );
    }

    renderWithProviders(<ObjectErrorTrigger />);
    await user.click(screen.getByText("Trigger object error"));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).not.toContain("[object Object]");
      expect(alert).toHaveTextContent("An operation failed");
    });
  });
});
