import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner";

function setOnlineStatus(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: online,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  setOnlineStatus(true);
  vi.restoreAllMocks();
});

describe("OfflineBanner", () => {
  it("does not show banner when online", () => {
    setOnlineStatus(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows banner when initially offline", () => {
    setOnlineStatus(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/offline/i);
  });

  it("shows banner when going offline", async () => {
    setOnlineStatus(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      setOnlineStatus(false);
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/offline/i);
    });
  });

  it("hides banner when coming back online", async () => {
    setOnlineStatus(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      setOnlineStatus(true);
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
