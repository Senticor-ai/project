import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ApiError,
  AuthApi,
  ItemsApi,
  FilesApi,
  ImportsApi,
  setUserContext,
  setCsrfToken,
  refreshCsrfToken,
  setSessionExpiredHandler,
} from "./api-client";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: "u-1",
  email: "test@example.com",
  username: "test",
  created_at: "2026-01-01T00:00:00Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(detail: string, status: number) {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
  setUserContext(null);
  setCsrfToken(null);
});

afterEach(() => {
  setSessionExpiredHandler(null);
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

describe("ApiError", () => {
  it("captures status and details", () => {
    const err = new ApiError({
      message: "Not found",
      status: 404,
      details: { code: "THING_NOT_FOUND" },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Not found");
    expect(err.status).toBe(404);
    expect(err.details).toEqual({ code: "THING_NOT_FOUND" });
  });
});

// ---------------------------------------------------------------------------
// request() internals (tested via AuthApi/ItemsApi)
// ---------------------------------------------------------------------------

describe("request()", () => {
  it("sends X-Request-ID header", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(MOCK_USER));
    await AuthApi.me();

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.has("X-Request-ID")).toBe(true);
  });

  it("sends Content-Type: application/json for POST with body", async () => {
    // login calls fetch twice: login + CSRF refresh
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(MOCK_USER))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "tok" }));
    await AuthApi.login("a@b.com", "password123");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("sends X-User-ID when user context is set", async () => {
    setUserContext({ id: "u-42", email: "a@b.com", created_at: "" });
    fetchSpy.mockResolvedValue(jsonResponse([]));
    await ItemsApi.list();

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("X-User-ID")).toBe("u-42");
  });

  it("sends X-CSRF-Token on unsafe methods when set", async () => {
    setCsrfToken("tok-123");
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
    await AuthApi.logout();

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("X-CSRF-Token")).toBe("tok-123");
  });

  it("does NOT send X-CSRF-Token on GET requests", async () => {
    setCsrfToken("tok-123");
    fetchSpy.mockResolvedValue(jsonResponse(MOCK_USER));
    await AuthApi.me();

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.has("X-CSRF-Token")).toBe(false);
  });

  it("throws ApiError on non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse("Unauthorized", 401));
    await expect(AuthApi.me()).rejects.toThrow(ApiError);

    fetchSpy.mockResolvedValueOnce(errorResponse("Unauthorized", 401));
    const status = await AuthApi.me().catch((e: ApiError) => e.status);
    expect(status).toBe(401);
  });

  it("throws ApiError with friendly message when backend returns HTML (e.g. proxy 502)", async () => {
    const htmlBody =
      "<html> <head><title>502 Bad Gateway</title></head></html>";
    fetchSpy.mockResolvedValueOnce(
      new Response(htmlBody, {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    );
    const err = await AuthApi.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(502);
    // Must NOT leak raw HTML or JSON parse errors to the user
    expect((err as ApiError).message).not.toContain("<html>");
    expect((err as ApiError).message).not.toContain("Unexpected token");
  });

  it("throws ApiError with friendly message on network error (backend unreachable)", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const err = await AuthApi.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    // Must NOT leak raw TypeError message
    expect((err as ApiError).message).not.toContain("Failed to fetch");
  });

  it("handles empty response body (204-like)", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 200 }));
    const result = await ItemsApi.get("t-1");
    expect(result).toBeNull();
  });

  it("throws ApiError with 429 status and retryAfter on rate limit", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("", {
        status: 429,
        headers: { "Retry-After": "60" },
      }),
    );
    const err = await ItemsApi.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).details).toEqual({ retryAfter: 60 });
  });

  it("defaults retryAfter to 30 when Retry-After header is missing", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 429 }));
    const err = await ItemsApi.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).details).toEqual({ retryAfter: 30 });
  });
});

// ---------------------------------------------------------------------------
// AuthApi
// ---------------------------------------------------------------------------

describe("AuthApi", () => {
  it("register sends email, username, password", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(MOCK_USER));
    const user = await AuthApi.register("test@example.com", "securepass");

    expect(user).toEqual(MOCK_USER);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/register");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "test@example.com",
      username: "test",
      password: "securepass",
    });
  });

  it("login calls /auth/login then refreshes CSRF token", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(MOCK_USER)) // login
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "new-csrf" })); // csrf

    const user = await AuthApi.login("test@example.com", "password123");
    expect(user).toEqual(MOCK_USER);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const [csrfUrl] = fetchSpy.mock.calls[1] as [string];
    expect(csrfUrl).toContain("/auth/csrf");
  });

  it("logout clears user and CSRF context", async () => {
    setUserContext(MOCK_USER);
    setCsrfToken("old-csrf");
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));

    await AuthApi.logout();

    // Verify subsequent requests don't include the cleared context
    fetchSpy.mockResolvedValue(jsonResponse([]));
    await ItemsApi.list();
    const [, init] = fetchSpy.mock.calls[1] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.has("X-User-ID")).toBe(false);
  });

  it("me sends GET to /auth/me and sets user context", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(MOCK_USER));
    const user = await AuthApi.me();
    expect(user).toEqual(MOCK_USER);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/me");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("refresh calls /auth/refresh and refreshes CSRF", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse({
          user: MOCK_USER,
          expires_at: "2026-01-01T01:00:00Z",
          refresh_expires_at: "2026-01-02T00:00:00Z",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "refreshed-csrf" }));

    const session = await AuthApi.refresh();
    expect(session.user).toEqual(MOCK_USER);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// refreshCsrfToken
// ---------------------------------------------------------------------------

describe("refreshCsrfToken", () => {
  it("fetches and stores CSRF token", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ csrf_token: "csrf-new" }));
    const token = await refreshCsrfToken();
    expect(token).toBe("csrf-new");

    // Verify it's used in subsequent requests
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
    await AuthApi.logout();
    const [, init] = fetchSpy.mock.calls[1] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("X-CSRF-Token")).toBe("csrf-new");
  });
});

// ---------------------------------------------------------------------------
// ItemsApi
// ---------------------------------------------------------------------------

describe("ItemsApi", () => {
  it("list sends GET with limit and offset", async () => {
    fetchSpy.mockResolvedValue(jsonResponse([]));
    await ItemsApi.list(10, 20);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain("/items?limit=10&offset=20");
  });

  it("sync builds query string from params", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        items: [],
        has_more: false,
        next_cursor: null,
        server_time: "2026-01-01T00:00:00Z",
      }),
    );
    await ItemsApi.sync({ limit: 100, cursor: "c-1", since: "2026-01-01" });
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain("limit=100");
    expect(url).toContain("cursor=c-1");
    expect(url).toContain("since=2026-01-01");
  });

  it("sync with no params sends no query string", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        items: [],
        has_more: false,
        next_cursor: null,
        server_time: "2026-01-01T00:00:00Z",
      }),
    );
    await ItemsApi.sync();
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toMatch(/\/items\/sync$/);
  });

  it("create sends POST with item and source", async () => {
    const record = { item_id: "t-1" };
    fetchSpy.mockResolvedValue(jsonResponse(record));
    await ItemsApi.create({ name: "Test" }, "manual");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/items");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      item: { name: "Test" },
      source: "manual",
    });
  });

  it("update sends PATCH with Idempotency-Key and name_source when provided", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ item_id: "t-1" }));
    await ItemsApi.update(
      "t-1",
      { name: "Updated" },
      "manual",
      "key-abc",
      "user renamed in EditableTitle",
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    const headers = new Headers(init.headers);
    expect(headers.get("Idempotency-Key")).toBe("key-abc");
    expect(JSON.parse(init.body as string)).toEqual({
      item: { name: "Updated" },
      source: "manual",
      name_source: "user renamed in EditableTitle",
    });
  });

  it("archive sends DELETE", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ item_id: "t-1", archived_at: "2026-01-01", ok: true }),
    );
    await ItemsApi.archive("t-1");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/items/t-1");
    expect(init.method).toBe("DELETE");
  });
});

// ---------------------------------------------------------------------------
// FilesApi
// ---------------------------------------------------------------------------

describe("FilesApi", () => {
  it("initiate sends POST with file metadata", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        upload_id: "up-1",
        upload_url: "/upload",
        chunk_size: 1024,
        chunk_total: 2,
        expires_at: "2026-01-01",
      }),
    );
    await FilesApi.initiate("doc.pdf", "application/pdf", 2048);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      filename: "doc.pdf",
      content_type: "application/pdf",
      total_size: 2048,
    });
  });

  it("uploadChunk sends PUT with binary body and chunk headers", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ received: 1 }));
    const blob = new Blob(["data"]);
    await FilesApi.uploadChunk("up-1", blob, 0, 2);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/files/upload/up-1");
    expect(init.method).toBe("PUT");
    const headers = new Headers(init.headers);
    expect(headers.get("X-Chunk-Index")).toBe("0");
    expect(headers.get("X-Chunk-Total")).toBe("2");
  });

  it("complete sends POST with upload_id", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ file_id: "f-1", original_name: "doc.pdf" }),
    );
    await FilesApi.complete("up-1");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ upload_id: "up-1" });
  });
});

// ---------------------------------------------------------------------------
// ImportsApi
// ---------------------------------------------------------------------------

describe("ImportsApi", () => {
  it("inspectNirvana sends POST", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ total: 5, created: 5, updated: 0, skipped: 0, errors: 0 }),
    );
    await ImportsApi.inspectNirvana({ file_id: "f-1" });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/imports/nirvana/inspect");
    expect(init.method).toBe("POST");
  });

  it("getJob sends GET to /imports/jobs/:id", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ job_id: "j-1", status: "completed" }),
    );
    await ImportsApi.getJob("j-1");

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain("/imports/jobs/j-1");
  });
});

// ---------------------------------------------------------------------------
// 401 session recovery
// ---------------------------------------------------------------------------

const REFRESH_RESPONSE = {
  user: MOCK_USER,
  expires_at: "2026-01-01T01:00:00Z",
  refresh_expires_at: "2026-01-02T00:00:00Z",
};

describe("401 session recovery", () => {
  it("retries original request after successful refresh on 401", async () => {
    // First call: 401, then refresh succeeds, then retry succeeds
    fetchSpy
      .mockResolvedValueOnce(errorResponse("Unauthorized", 401)) // GET /items
      .mockResolvedValueOnce(jsonResponse(REFRESH_RESPONSE)) // POST /auth/refresh
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "new" })) // GET /auth/csrf
      .mockResolvedValueOnce(jsonResponse([])); // retry GET /items

    const result = await ItemsApi.list();
    expect(result).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(4);

    // Verify the retry went to the same URL
    const [firstUrl] = fetchSpy.mock.calls[0] as [string];
    const [retryUrl] = fetchSpy.mock.calls[3] as [string];
    expect(retryUrl).toBe(firstUrl);
  });

  it("calls onSessionExpired and throws when refresh fails", async () => {
    const expiredHandler = vi.fn();
    setSessionExpiredHandler(expiredHandler);

    // First call: 401, then refresh also fails
    fetchSpy
      .mockResolvedValueOnce(errorResponse("Unauthorized", 401)) // GET /items
      .mockResolvedValueOnce(errorResponse("Refresh failed", 401)); // POST /auth/refresh

    await expect(ItemsApi.list()).rejects.toThrow(ApiError);
    expect(expiredHandler).toHaveBeenCalledOnce();
  });

  it("deduplicates concurrent refresh calls", async () => {
    // Two requests both get 401, but only one refresh should happen
    fetchSpy
      .mockResolvedValueOnce(errorResponse("Unauthorized", 401)) // GET /items (1)
      .mockResolvedValueOnce(errorResponse("Unauthorized", 401)) // GET /items (2)
      .mockResolvedValueOnce(jsonResponse(REFRESH_RESPONSE)) // POST /auth/refresh (shared)
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "new" })) // GET /auth/csrf
      .mockResolvedValueOnce(jsonResponse([])) // retry (1)
      .mockResolvedValueOnce(jsonResponse([])); // retry (2)

    const [r1, r2] = await Promise.all([ItemsApi.list(), ItemsApi.list(10, 0)]);
    expect(r1).toEqual([]);
    expect(r2).toEqual([]);

    // Count how many calls went to /auth/refresh
    const refreshCalls = fetchSpy.mock.calls.filter(([url]: unknown[]) =>
      (url as string).includes("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("skips refresh attempt for /auth/* paths", async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse("Unauthorized", 401));

    await expect(AuthApi.me()).rejects.toThrow(ApiError);
    // Only 1 call (no refresh attempt)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
