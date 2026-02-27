import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickTriageView } from "./QuickTriageView";
import { createActionItem } from "@/model/factories";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

const items = [
  createActionItem({ name: "Buy groceries", bucket: "inbox" }),
  createActionItem({ name: "Call dentist", bucket: "inbox" }),
  createActionItem({ name: "Read article", bucket: "inbox" }),
];

describe("QuickTriageView", () => {
  it("renders the first item as active card", () => {
    render(
      <QuickTriageView
        items={items}
        onMove={vi.fn()}
        onArchive={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
  });

  it("shows progress indicator", () => {
    render(
      <QuickTriageView
        items={items}
        onMove={vi.fn()}
        onArchive={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("renders close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <QuickTriageView
        items={items}
        onMove={vi.fn()}
        onArchive={vi.fn()}
        onClose={onClose}
      />,
      { wrapper },
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows celebration when no items remain", () => {
    render(
      <QuickTriageView
        items={[]}
        onMove={vi.fn()}
        onArchive={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText(/Inbox empty/i)).toBeInTheDocument();
  });
});
