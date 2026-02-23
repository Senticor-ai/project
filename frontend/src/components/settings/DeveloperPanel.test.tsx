import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeveloperPanel } from "./DeveloperPanel";
import type { PwaStorageStats } from "./DeveloperPanel";

const LOADED_STATS: PwaStorageStats = {
  originUsage: 4_500_000,
  originQuota: 2_147_483_648,
  cachedQueryCount: 142,
  queryCacheSize: 1_350_000,
  cacheNames: ["items-sync", "workbox-precache"],
  serviceWorkerActive: true,
  loading: false,
};

const LOADING_STATS: PwaStorageStats = {
  originUsage: null,
  originQuota: null,
  cachedQueryCount: null,
  queryCacheSize: null,
  cacheNames: [],
  serviceWorkerActive: false,
  loading: true,
};

describe("DeveloperPanel", () => {
  it("renders the flush button", () => {
    render(<DeveloperPanel />);
    expect(
      screen.getByRole("button", { name: /flush all data/i }),
    ).toBeInTheDocument();
  });

  it("shows confirmation input after clicking flush", async () => {
    const user = userEvent.setup();
    render(<DeveloperPanel />);

    await user.click(screen.getByRole("button", { name: /flush all data/i }));

    expect(screen.getByLabelText(/type flush to confirm/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirm flush/i }),
    ).toBeDisabled();
  });

  it("enables confirm button only when user types FLUSH", async () => {
    const user = userEvent.setup();
    render(<DeveloperPanel />);

    await user.click(screen.getByRole("button", { name: /flush all data/i }));

    const input = screen.getByLabelText(/type flush to confirm/i);
    await user.type(input, "FLUS");
    expect(
      screen.getByRole("button", { name: /confirm flush/i }),
    ).toBeDisabled();

    await user.type(input, "H");
    expect(
      screen.getByRole("button", { name: /confirm flush/i }),
    ).toBeEnabled();
  });

  it("calls onFlush when confirmed and shows result", async () => {
    const user = userEvent.setup();
    const onFlush = vi.fn().mockResolvedValue({
      ok: true,
      deleted: { items: 42, assertions: 5, files: 3 },
    });
    render(<DeveloperPanel onFlush={onFlush} />);

    await user.click(screen.getByRole("button", { name: /flush all data/i }));
    await user.type(screen.getByLabelText(/type flush to confirm/i), "FLUSH");
    await user.click(screen.getByRole("button", { name: /confirm flush/i }));

    expect(onFlush).toHaveBeenCalledOnce();

    // After flush completes, result should be shown
    expect(await screen.findByText(/items: 42/)).toBeInTheDocument();
  });

  it("shows error message when flush fails", async () => {
    const user = userEvent.setup();
    const onFlush = vi.fn().mockRejectedValue(new Error("Server error"));
    render(<DeveloperPanel onFlush={onFlush} />);

    await user.click(screen.getByRole("button", { name: /flush all data/i }));
    await user.type(screen.getByLabelText(/type flush to confirm/i), "FLUSH");
    await user.click(screen.getByRole("button", { name: /confirm flush/i }));

    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
  });

  it("allows cancelling the confirmation", async () => {
    const user = userEvent.setup();
    render(<DeveloperPanel />);

    await user.click(screen.getByRole("button", { name: /flush all data/i }));
    expect(screen.getByLabelText(/type flush to confirm/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(
      screen.queryByLabelText(/type flush to confirm/i),
    ).not.toBeInTheDocument();
  });
});

describe("DeveloperPanel — Local Storage", () => {
  it("renders storage stats when provided", () => {
    render(<DeveloperPanel storageStats={LOADED_STATS} />);

    expect(screen.getByText("Local Storage")).toBeInTheDocument();
    expect(screen.getByText(/4\.3 MB/)).toBeInTheDocument();
    expect(screen.getByText(/142 queries/)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows loading indicator when stats are loading", () => {
    render(<DeveloperPanel storageStats={LOADING_STATS} />);

    expect(screen.getByText("Local Storage")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows Not registered when service worker is inactive", () => {
    render(
      <DeveloperPanel
        storageStats={{ ...LOADED_STATS, serviceWorkerActive: false }}
      />,
    );

    expect(screen.getByText("Not registered")).toBeInTheDocument();
  });

  it("shows Clear Local Cache button", () => {
    render(
      <DeveloperPanel
        storageStats={LOADED_STATS}
        onClearLocalCache={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /clear local cache/i }),
    ).toBeInTheDocument();
  });

  it("shows confirmation after clicking clear", async () => {
    const user = userEvent.setup();
    render(
      <DeveloperPanel
        storageStats={LOADED_STATS}
        onClearLocalCache={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /clear local cache/i }),
    );

    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirm/i }),
    ).toBeInTheDocument();
  });

  it("calls onClearLocalCache when confirmed", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn().mockResolvedValue(undefined);
    render(
      <DeveloperPanel
        storageStats={LOADED_STATS}
        onClearLocalCache={onClear}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /clear local cache/i }),
    );
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(await screen.findByText(/cleared/i)).toBeInTheDocument();
  });

  it("shows error when clear fails", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn().mockRejectedValue(new Error("Clear failed"));
    render(
      <DeveloperPanel
        storageStats={LOADED_STATS}
        onClearLocalCache={onClear}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /clear local cache/i }),
    );
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(await screen.findByText(/clear failed/i)).toBeInTheDocument();
  });

  it("allows cancelling the clear confirmation", async () => {
    const user = userEvent.setup();
    render(
      <DeveloperPanel
        storageStats={LOADED_STATS}
        onClearLocalCache={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /clear local cache/i }),
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
  });
});
