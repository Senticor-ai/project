import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @grafana/faro-web-sdk
// ---------------------------------------------------------------------------

const mockApi = {
  pushEvent: vi.fn(),
  setUser: vi.fn(),
  resetUser: vi.fn(),
};

const mockFaroInstance = { api: mockApi };

vi.mock("@grafana/faro-web-sdk", () => ({
  initializeFaro: vi.fn(() => mockFaroInstance),
  getWebInstrumentations: vi.fn(() => []),
}));

// ---------------------------------------------------------------------------
// Helpers — dynamic import to reset module state between tests
// ---------------------------------------------------------------------------

async function loadFaroModule() {
  const mod = await import("./faro");
  return mod;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// initFaro()
// ---------------------------------------------------------------------------

describe("initFaro()", () => {
  it("returns null when VITE_FARO_COLLECTOR_URL is not set", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "");
    const { initFaro } = await loadFaroModule();
    expect(initFaro()).toBeNull();
  });

  it("initializes Faro when collector URL is configured", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "http://collector:4318");
    vi.stubEnv("VITE_FARO_APP_NAME", "test-app");
    vi.stubEnv("VITE_FARO_ENVIRONMENT", "test");

    const { initializeFaro } = await import("@grafana/faro-web-sdk");
    const { initFaro } = await loadFaroModule();

    const result = initFaro();

    expect(result).toBe(mockFaroInstance);
    expect(initializeFaro).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://collector:4318",
        app: { name: "test-app", environment: "test" },
      }),
    );
  });

  it("pushes app_bootstrapped event on init", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "http://collector:4318");
    const { initFaro } = await loadFaroModule();

    initFaro();

    expect(mockApi.pushEvent).toHaveBeenCalledWith(
      "app_bootstrapped",
      expect.objectContaining({ timestamp: expect.any(String) }),
    );
  });

  it("returns the same instance on subsequent calls (singleton)", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "http://collector:4318");
    const { initializeFaro } = await import("@grafana/faro-web-sdk");
    const { initFaro } = await loadFaroModule();

    const first = initFaro();
    const second = initFaro();

    expect(first).toBe(second);
    expect(initializeFaro).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getFaro()
// ---------------------------------------------------------------------------

describe("getFaro()", () => {
  it("returns null before initialization", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "");
    const { getFaro } = await loadFaroModule();
    expect(getFaro()).toBeNull();
  });

  it("returns the Faro instance after initialization", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "http://collector:4318");
    const { initFaro, getFaro } = await loadFaroModule();

    initFaro();

    expect(getFaro()).toBe(mockFaroInstance);
  });
});

// ---------------------------------------------------------------------------
// setFaroUser()
// ---------------------------------------------------------------------------

describe("setFaroUser()", () => {
  it("does nothing when Faro is not initialized", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "");
    const { setFaroUser } = await loadFaroModule();

    // Should not throw
    setFaroUser({ id: "u-1", email: "a@b.com", created_at: "" });
    expect(mockApi.setUser).not.toHaveBeenCalled();
  });

  it("sets user context when user is provided", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "http://collector:4318");
    const { initFaro, setFaroUser } = await loadFaroModule();

    initFaro();
    setFaroUser({
      id: "u-1",
      email: "test@example.com",
      username: "tester",
      created_at: "2026-01-01T00:00:00Z",
    });

    expect(mockApi.setUser).toHaveBeenCalledWith({
      id: "u-1",
      email: "test@example.com",
      username: "tester",
    });
  });

  it("resets user context when null is provided", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "http://collector:4318");
    const { initFaro, setFaroUser } = await loadFaroModule();

    initFaro();
    setFaroUser(null);

    expect(mockApi.resetUser).toHaveBeenCalled();
  });

  it("passes undefined for username when not present", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "http://collector:4318");
    const { initFaro, setFaroUser } = await loadFaroModule();

    initFaro();
    setFaroUser({ id: "u-2", email: "no-name@example.com", created_at: "" });

    expect(mockApi.setUser).toHaveBeenCalledWith({
      id: "u-2",
      email: "no-name@example.com",
      username: undefined,
    });
  });
});
