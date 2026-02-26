import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerBackgroundSync } from "./sync-manager";

describe("registerBackgroundSync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when serviceWorker is not in navigator", async () => {
    const original = navigator.serviceWorker;
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
    expect(await registerBackgroundSync("my-tag")).toBe(false);
    Object.defineProperty(navigator, "serviceWorker", {
      value: original,
      configurable: true,
    });
  });

  it("returns true when Background Sync is supported", async () => {
    const registerFn = vi.fn().mockResolvedValue(undefined);
    const mockRegistration = { sync: { register: registerFn } };
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(mockRegistration) },
      configurable: true,
    });

    expect(await registerBackgroundSync("offline-sync")).toBe(true);
    expect(registerFn).toHaveBeenCalledWith("offline-sync");

    // Cleanup
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
  });

  it("returns false when sync is not in registration", async () => {
    const mockRegistration = {};
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(mockRegistration) },
      configurable: true,
    });

    expect(await registerBackgroundSync("my-tag")).toBe(false);

    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
  });

  it("returns false when sync.register throws", async () => {
    const registerFn = vi.fn().mockRejectedValue(new Error("denied"));
    const mockRegistration = { sync: { register: registerFn } };
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(mockRegistration) },
      configurable: true,
    });

    expect(await registerBackgroundSync("my-tag")).toBe(false);

    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
  });
});
