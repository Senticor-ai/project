import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PwaUpdateNotifier } from "./PwaUpdateNotifier";

const mockToast = vi.fn();
const mockUpdateServiceWorker = vi.fn();

vi.mock("@/lib/pwa-update", () => ({
  usePwaUpdate: vi.fn(() => ({
    needRefresh: false,
    updateServiceWorker: mockUpdateServiceWorker,
  })),
}));

vi.mock("@/lib/toast-context", () => ({
  ToastContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: () => null,
    displayName: "ToastContext",
    _currentValue: null,
  },
}));

// Override useContext to return our mock toast context
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useContext: vi.fn((ctx: { displayName?: string }) => {
      if (ctx?.displayName === "ToastContext") {
        return { toast: mockToast };
      }
      return actual.useContext(ctx as React.Context<unknown>);
    }),
  };
});

describe("PwaUpdateNotifier", () => {
  it("renders nothing (returns null)", () => {
    const { container } = render(<PwaUpdateNotifier />);
    expect(container.innerHTML).toBe("");
  });

  it("does not show toast when needRefresh is false", () => {
    render(<PwaUpdateNotifier />);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("shows toast when needRefresh becomes true", async () => {
    const { usePwaUpdate } = await import("@/lib/pwa-update");
    vi.mocked(usePwaUpdate).mockReturnValue({
      needRefresh: true,
      updateServiceWorker: mockUpdateServiceWorker,
    });

    render(<PwaUpdateNotifier />);

    expect(mockToast).toHaveBeenCalledWith(
      "A new version is available.",
      "info",
      expect.objectContaining({
        persistent: true,
        action: expect.objectContaining({ label: "Reload" }),
      }),
    );
  });
});
