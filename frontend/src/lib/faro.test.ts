import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @grafana/faro-web-sdk
// ---------------------------------------------------------------------------

const mockSpan = {
  setAttribute: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};
const mockStartActiveSpan = vi.fn(
  async (_name: string, callback: (span: typeof mockSpan) => unknown) =>
    callback(mockSpan),
);
const mockGetTracer = vi.fn(() => ({
  startActiveSpan: mockStartActiveSpan,
}));
const mockGetOTEL = vi.fn(() => ({
  trace: {
    getTracer: mockGetTracer,
  },
}));
const mockApi = {
  pushEvent: vi.fn(),
  setUser: vi.fn(),
  resetUser: vi.fn(),
  getOTEL: mockGetOTEL,
};

const mockFaroInstance = { api: mockApi };

vi.mock("@grafana/faro-web-sdk", () => ({
  initializeFaro: vi.fn(() => mockFaroInstance),
  getWebInstrumentations: vi.fn(() => []),
}));

const MockTracingInstrumentation = vi.fn(
  class {
    name = "tracing-instrumentation";
  },
);

vi.mock("@grafana/faro-web-tracing", () => ({
  TracingInstrumentation: MockTracingInstrumentation,
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
    const { TracingInstrumentation } =
      await import("@grafana/faro-web-tracing");
    const { initFaro } = await loadFaroModule();

    const result = initFaro();

    expect(result).toBe(mockFaroInstance);
    expect(TracingInstrumentation).toHaveBeenCalledOnce();
    expect(initializeFaro).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://collector:4318",
        app: { name: "test-app", environment: "test" },
        instrumentations: expect.arrayContaining([
          expect.objectContaining({ name: "tracing-instrumentation" }),
        ]),
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
// withFaroActiveSpan()
// ---------------------------------------------------------------------------

describe("withFaroActiveSpan()", () => {
  it("runs without tracing when Faro is not initialized", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "");
    const { withFaroActiveSpan } = await loadFaroModule();
    const setAttribute = vi.fn();
    const recordError = vi.fn();

    const result = await withFaroActiveSpan(
      "ui.chat.submit",
      {},
      async (span) => {
        span.setAttribute("chat.request_id", "req-1");
        span.recordError(new Error("ignored"));
        setAttribute();
        recordError();
        return "ok";
      },
    );

    expect(result).toBe("ok");
    expect(setAttribute).toHaveBeenCalledOnce();
    expect(recordError).toHaveBeenCalledOnce();
    expect(mockStartActiveSpan).not.toHaveBeenCalled();
  });

  it("starts a span and applies attributes when tracing is available", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "http://collector:4318");
    const { initFaro, withFaroActiveSpan } = await loadFaroModule();

    initFaro();
    const result = await withFaroActiveSpan(
      "ui.chat.submit",
      {
        "chat.conversation_id": "conv-1",
        "chat.timeout_ms": 120_000,
      },
      async (span) => {
        span.setAttribute("chat.request_id", "req-1");
        return "done";
      },
    );

    expect(result).toBe("done");
    expect(mockGetTracer).toHaveBeenCalledWith("test-app");
    expect(mockStartActiveSpan).toHaveBeenCalledWith(
      "ui.chat.submit",
      expect.any(Function),
    );
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      "chat.conversation_id",
      "conv-1",
    );
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      "chat.timeout_ms",
      120_000,
    );
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      "chat.request_id",
      "req-1",
    );
    expect(mockSpan.end).toHaveBeenCalledOnce();
  });

  it("records thrown errors on the span", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "http://collector:4318");
    const { initFaro, withFaroActiveSpan } = await loadFaroModule();

    initFaro();

    await expect(
      withFaroActiveSpan("ui.chat.submit", {}, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(mockSpan.recordException).toHaveBeenCalledWith(expect.any(Error));
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("error.type", "Error");
    expect(mockSpan.end).toHaveBeenCalledOnce();
  });

  it("prefers semantic errorType over Error.name", async () => {
    vi.stubEnv("VITE_FARO_COLLECTOR_URL", "http://collector:4318");
    const { initFaro, withFaroActiveSpan } = await loadFaroModule();

    initFaro();

    await withFaroActiveSpan("ui.chat.submit", {}, async (span) => {
      span.recordError(
        Object.assign(new Error("boom"), {
          errorType: "frontend_timeout",
        }),
      );
    });

    expect(mockSpan.recordException).toHaveBeenCalledWith(expect.any(Error));
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      "error.type",
      "frontend_timeout",
    );
    expect(mockSpan.end).toHaveBeenCalledOnce();
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
