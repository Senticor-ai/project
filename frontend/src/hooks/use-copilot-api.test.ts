import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
const {
  mockGetOrRefreshCsrfToken,
  mockRefreshCsrfToken,
  mockWithFaroActiveSpan,
  mockSpanSetAttribute,
  mockSpanRecordError,
} = vi.hoisted(() => ({
  mockGetOrRefreshCsrfToken: vi.fn(),
  mockRefreshCsrfToken: vi.fn(),
  mockWithFaroActiveSpan: vi.fn(),
  mockSpanSetAttribute: vi.fn(),
  mockSpanRecordError: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  getOrRefreshCsrfToken: mockGetOrRefreshCsrfToken,
  refreshCsrfToken: mockRefreshCsrfToken,
}));

vi.mock("@/lib/faro", () => ({
  withFaroActiveSpan: mockWithFaroActiveSpan,
}));

import { useCopilotApi, readNdjsonStream } from "./use-copilot-api";
import type { StreamEvent } from "@/model/chat-types";

beforeEach(() => {
  vi.resetAllMocks();
  mockGetOrRefreshCsrfToken.mockResolvedValue("csrf-test-token");
  mockRefreshCsrfToken.mockResolvedValue("csrf-refreshed-token");
  mockWithFaroActiveSpan.mockImplementation(
    async (
      _name: string,
      _attributes: Record<string, unknown>,
      run: (span: {
        setAttribute: typeof mockSpanSetAttribute;
        recordError: typeof mockSpanRecordError;
      }) => Promise<unknown>,
    ) =>
      run({
        setAttribute: mockSpanSetAttribute,
        recordError: mockSpanRecordError,
      }),
  );
  document.body.innerHTML = "";
  window.history.pushState({}, "", "/");
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a ReadableStream that yields NDJSON lines from an array of events. */
function ndjsonStream(events: StreamEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = events.map((e) => JSON.stringify(e) + "\n").join("");
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
}

/** Build a fetch Response-like object with a ReadableStream body. */
function streamResponse(events: StreamEvent[], ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    body: ndjsonStream(events),
  });
}

// ---------------------------------------------------------------------------
// readNdjsonStream (pure function)
// ---------------------------------------------------------------------------

describe("readNdjsonStream", () => {
  it("parses multiple NDJSON lines into events", async () => {
    const events: StreamEvent[] = [
      { type: "text_delta", content: "Hello " },
      { type: "text_delta", content: "world" },
      { type: "done", text: "Hello world" },
    ];
    const collected: StreamEvent[] = [];

    await readNdjsonStream(ndjsonStream(events), (e) => collected.push(e));

    expect(collected).toEqual(events);
  });

  it("handles chunked delivery across line boundaries", async () => {
    const encoder = new TextEncoder();
    const line1 = JSON.stringify({ type: "text_delta", content: "A" });
    const line2 = JSON.stringify({ type: "done", text: "A" });
    const full = line1 + "\n" + line2 + "\n";

    // Split in the middle of line1
    const splitAt = Math.floor(line1.length / 2);
    const chunk1 = full.slice(0, splitAt);
    const chunk2 = full.slice(splitAt);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(chunk1));
        controller.enqueue(encoder.encode(chunk2));
        controller.close();
      },
    });

    const collected: StreamEvent[] = [];
    await readNdjsonStream(stream, (e) => collected.push(e));

    expect(collected).toHaveLength(2);
    expect(collected[0]).toEqual({ type: "text_delta", content: "A" });
    expect(collected[1]).toEqual({ type: "done", text: "A" });
  });

  it("skips malformed lines", async () => {
    const encoder = new TextEncoder();
    const data =
      '{"type":"text_delta","content":"ok"}\nnot-json\n{"type":"done","text":"ok"}\n';

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(data));
        controller.close();
      },
    });

    const collected: StreamEvent[] = [];
    await readNdjsonStream(stream, (e) => collected.push(e));

    expect(collected).toHaveLength(2);
  });

  it("skips empty lines", async () => {
    const encoder = new TextEncoder();
    const data =
      '\n{"type":"text_delta","content":"a"}\n\n{"type":"done","text":"a"}\n\n';

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(data));
        controller.close();
      },
    });

    const collected: StreamEvent[] = [];
    await readNdjsonStream(stream, (e) => collected.push(e));

    expect(collected).toHaveLength(2);
  });

  it("processes remaining data in buffer without trailing newline", async () => {
    const encoder = new TextEncoder();
    // No trailing newline after the last event
    const data = '{"type":"done","text":"fin"}';

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(data));
        controller.close();
      },
    });

    const collected: StreamEvent[] = [];
    await readNdjsonStream(stream, (e) => collected.push(e));

    expect(collected).toHaveLength(1);
    expect(collected[0]).toEqual({ type: "done", text: "fin" });
  });
});

// ---------------------------------------------------------------------------
// useCopilotApi hook
// ---------------------------------------------------------------------------

describe("useCopilotApi", () => {
  it("sends POST to /chat/completions with message and conversationId", async () => {
    mockFetch.mockReturnValue(streamResponse([{ type: "done", text: "OK" }]));
    const { result } = renderHook(() => useCopilotApi());

    const events: StreamEvent[] = [];
    await result.current.sendMessageStreaming("Hallo", "conv-123", (e) =>
      events.push(e),
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/chat/completions");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers["X-CSRF-Token"]).toBe("csrf-test-token");
    expect(opts.headers["X-Request-ID"]).toEqual(expect.any(String));
    expect(opts.credentials).toBe("include");
    expect(mockGetOrRefreshCsrfToken).toHaveBeenCalledOnce();
    expect(mockWithFaroActiveSpan).toHaveBeenCalledWith(
      "ui.chat.submit",
      expect.objectContaining({
        "chat.conversation_id": "conv-123",
        "chat.request_id": expect.any(String),
        "chat.timeout_ms": 120_000,
      }),
      expect.any(Function),
    );
    const body = JSON.parse(opts.body as string);
    expect(body.message).toBe("Hallo");
    expect(body.conversationId).toBe("conv-123");
    expect(body.context).toEqual(
      expect.objectContaining({
        timezone: expect.any(String),
        locale: expect.any(String),
        localTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        currentPath: expect.any(String),
        currentUrl: expect.any(String),
        appView: expect.any(String),
        appSubView: expect.any(String),
      }),
    );
    expect(Array.isArray(body.context.visibleErrors)).toBe(true);
  });

  it("includes page and visible error context from current UI", async () => {
    window.history.pushState({}, "", "/settings/sync?tab=sync");
    document.body.innerHTML = `
      <p class="text-status-error">OAuth token expired. Please reconnect.</p>
      <div role="alert">Email sync failed for this connection.</div>
    `;
    mockFetch.mockReturnValue(streamResponse([{ type: "done", text: "OK" }]));
    const { result } = renderHook(() => useCopilotApi());

    await result.current.sendMessageStreaming(
      "Was ist hier kaputt?",
      "conv-ui",
      () => {},
    );

    const [, opts] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(opts.body as string);
    expect(body.context.appView).toBe("settings");
    expect(body.context.appSubView).toBe("sync");
    expect(body.context.activeBucket).toBeNull();
    expect(body.context.currentPath).toContain("/settings/sync");
    expect(body.context.visibleErrors).toEqual(
      expect.arrayContaining([
        "OAuth token expired. Please reconnect.",
        "Email sync failed for this connection.",
      ]),
    );
  });

  it("captures visible workspace snapshot from current viewport", async () => {
    window.history.pushState({}, "", "/workspace/next");
    document.body.innerHTML = `
      <main aria-label="Bucket content">
        <h1>Next</h1>
      </main>
      <div
        data-copilot-item="true"
        data-copilot-item-id="urn:app:action:a1"
        data-copilot-item-type="action"
        data-copilot-item-bucket="next"
        data-copilot-item-name="Ship release notes"
        data-copilot-item-focused="true"
      ></div>
      <button
        data-copilot-bucket-nav-item="true"
        data-copilot-bucket="next"
        data-copilot-bucket-count="12"
        data-copilot-bucket-active="true"
      ></button>
    `;

    mockFetch.mockReturnValue(streamResponse([{ type: "done", text: "OK" }]));
    const { result } = renderHook(() => useCopilotApi());

    await result.current.sendMessageStreaming(
      "Was ist sichtbar?",
      "conv-view",
      () => {},
    );

    const [, opts] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(opts.body as string);
    expect(body.context.visibleWorkspaceSnapshot).toEqual(
      expect.objectContaining({
        activeBucket: "next",
        viewTitle: "Next",
        totalVisibleItems: 1,
      }),
    );
    expect(body.context.visibleWorkspaceSnapshot.visibleItems[0]).toEqual(
      expect.objectContaining({
        id: "urn:app:action:a1",
        type: "action",
        bucket: "next",
        name: "Ship release notes",
        focused: true,
      }),
    );
  });

  it("delivers text_delta events via callback", async () => {
    mockFetch.mockReturnValue(
      streamResponse([
        { type: "text_delta", content: "Hello " },
        { type: "text_delta", content: "world" },
        { type: "done", text: "Hello world" },
      ]),
    );
    const { result } = renderHook(() => useCopilotApi());

    const events: StreamEvent[] = [];
    await result.current.sendMessageStreaming("Test", "conv-1", (e) =>
      events.push(e),
    );

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "text_delta", content: "Hello " });
    expect(events[1]).toEqual({ type: "text_delta", content: "world" });
    expect(events[2]).toEqual({ type: "done", text: "Hello world" });
  });

  it("delivers tool_calls events via callback", async () => {
    mockFetch.mockReturnValue(
      streamResponse([
        { type: "text_delta", content: "Vorschlag:" },
        {
          type: "tool_calls",
          toolCalls: [
            {
              name: "create_action",
              arguments: {
                type: "create_action",
                name: "Task",
                bucket: "next",
              },
            },
          ],
        },
        { type: "done", text: "Vorschlag:" },
      ]),
    );
    const { result } = renderHook(() => useCopilotApi());

    const events: StreamEvent[] = [];
    await result.current.sendMessageStreaming("Erstelle", "conv-1", (e) =>
      events.push(e),
    );

    const toolEvent = events.find((e) => e.type === "tool_calls");
    expect(toolEvent).toBeDefined();
    expect(
      toolEvent!.type === "tool_calls" && toolEvent!.toolCalls,
    ).toHaveLength(1);
  });

  it("annotates the ui.chat.submit span with response status and accepted request ID", async () => {
    mockFetch.mockReturnValue(
      streamResponse([
        { type: "accepted", requestId: "req-accepted-1" },
        { type: "done", text: "Hello world" },
      ]),
    );
    const { result } = renderHook(() => useCopilotApi());

    await result.current.sendMessageStreaming("Test", "conv-1", () => {});

    expect(mockSpanSetAttribute).toHaveBeenCalledWith("http.status_code", 200);
    expect(mockSpanSetAttribute).toHaveBeenCalledWith(
      "chat.request_id",
      "req-accepted-1",
    );
  });

  it("throws on non-ok response with status code", async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({ ok: false, status: 500, body: null }),
    );
    const { result } = renderHook(() => useCopilotApi());

    await expect(
      result.current.sendMessageStreaming("Test", "conv-1", () => {}),
    ).rejects.toThrow("Chat request failed: 500");
  });

  it("refreshes CSRF and retries once when backend reports invalid CSRF token", async () => {
    mockGetOrRefreshCsrfToken.mockResolvedValue("csrf-stale-token");
    mockRefreshCsrfToken.mockResolvedValue("csrf-fresh-token");
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        body: null,
        text: async () => JSON.stringify({ detail: "Invalid CSRF token" }),
      })
      .mockReturnValueOnce(
        streamResponse([{ type: "done", text: "OK after retry" }]),
      );

    const { result } = renderHook(() => useCopilotApi());
    const events: StreamEvent[] = [];
    await result.current.sendMessageStreaming("Test", "conv-csrf", (event) =>
      events.push(event),
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockRefreshCsrfToken).toHaveBeenCalledOnce();

    const firstHeaders = mockFetch.mock.calls[0]?.[1]?.headers;
    const secondHeaders = mockFetch.mock.calls[1]?.[1]?.headers;
    expect(firstHeaders["X-CSRF-Token"]).toBe("csrf-stale-token");
    expect(secondHeaders["X-CSRF-Token"]).toBe("csrf-fresh-token");
    expect(firstHeaders["X-Request-ID"]).toBe(secondHeaders["X-Request-ID"]);
    expect(events).toEqual([{ type: "done", text: "OK after retry" }]);
  });

  it("surfaces backend error detail from NDJSON body on non-ok response", async () => {
    mockFetch.mockReturnValue(
      streamResponse(
        [{ type: "error", detail: "OpenClaw container is still starting." }],
        false,
        503,
      ),
    );
    const { result } = renderHook(() => useCopilotApi());

    await expect(
      result.current.sendMessageStreaming("Test", "conv-1", () => {}),
    ).rejects.toThrow("OpenClaw container is still starting.");
  });

  it("does not double-consume response body when text() returns no detail", async () => {
    // Regression: real fetch Response has both .text() and .body.
    // When .text() finds no parseable detail, the code must NOT fall through
    // to .body.getReader() — the stream is already consumed by .text().
    const body = ndjsonStream([{ type: "error", detail: "Agent unavailable" }]);
    mockFetch.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 504,
        body,
        // .text() returns a non-JSON gateway error — no parseable detail
        text: async () => "<html>504 Gateway Timeout</html>",
      }),
    );
    const { result } = renderHook(() => useCopilotApi());

    // Should throw with generic message, NOT with ReadableStream lock error
    await expect(
      result.current.sendMessageStreaming("Test", "conv-1", () => {}),
    ).rejects.toThrow("Chat request failed: 504");
  });

  it("throws when response body is missing", async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({ ok: true, status: 200, body: null }),
    );
    const { result } = renderHook(() => useCopilotApi());

    await expect(
      result.current.sendMessageStreaming("Test", "conv-1", () => {}),
    ).rejects.toThrow("No response body for streaming");
  });

  it("throws on network error", async () => {
    mockFetch.mockReturnValue(Promise.reject(new Error("Network error")));
    const { result } = renderHook(() => useCopilotApi());

    await expect(
      result.current.sendMessageStreaming("Test", "conv-1", () => {}),
    ).rejects.toThrow("Network error");
  });

  it("parses enriched error event with requestId and errorType", async () => {
    mockFetch.mockReturnValue(
      streamResponse(
        [
          {
            type: "error",
            detail: "Agents service timeout",
            requestId: "req-abc-123",
            errorType: "provider_timeout",
          },
        ],
        false,
        503,
      ),
    );
    const { result } = renderHook(() => useCopilotApi());

    const events: StreamEvent[] = [];
    await expect(
      result.current.sendMessageStreaming("Test", "conv-1", (e) =>
        events.push(e),
      ),
    ).rejects.toThrow("Agents service timeout");
  });

  it("aborts request after timeout deadline", async () => {
    vi.useFakeTimers();
    try {
      mockFetch
        .mockImplementationOnce(
          (_url: string, opts: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              opts.signal?.addEventListener("abort", () => {
                reject(
                  new DOMException("The operation was aborted.", "AbortError"),
                );
              });
            }),
        )
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const { result } = renderHook(() => useCopilotApi());
      const promise = result.current.sendMessageStreaming(
        "Test",
        "conv-timeout",
        () => {},
      );
      const assertion = expect(promise).rejects.toThrow("Chat request timed out");

      await vi.advanceTimersByTimeAsync(125_000);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("reloads persisted conversation messages when timeout recovery completes", async () => {
    vi.useFakeTimers();
    const randomUuid = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("22222222-2222-4222-8222-222222222222");

    try {
      const abortError = new DOMException(
        "The operation was aborted.",
        "AbortError",
      );
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(abortError);
        },
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            requestId: "22222222-2222-4222-8222-222222222222",
            conversationId: "db-conv-1",
            status: "completed",
            createdAt: "2026-03-11T10:00:00.000Z",
            updatedAt: "2026-03-11T10:01:00.000Z",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [
            {
              messageId: "msg-1",
              role: "user",
              content: "Hallo",
              createdAt: "2026-03-11T10:00:00.000Z",
            },
            {
              messageId: "msg-2",
              role: "assistant",
              content: "Recovered answer",
              createdAt: "2026-03-11T10:01:00.000Z",
            },
          ],
        });

      const { result } = renderHook(() => useCopilotApi());
      const events: StreamEvent[] = [];

      const promise = result.current.sendMessageStreaming(
        "Test",
        "conv-timeout",
        (event) => events.push(event),
      );

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5_000);
      await promise;

      expect(events).toEqual([
        {
          type: "conversation_reloaded",
          conversationId: "db-conv-1",
          messages: [
            {
              messageId: "msg-1",
              role: "user",
              content: "Hallo",
              createdAt: "2026-03-11T10:00:00.000Z",
            },
            {
              messageId: "msg-2",
              role: "assistant",
              content: "Recovered answer",
              createdAt: "2026-03-11T10:01:00.000Z",
            },
          ],
        },
        { type: "items_changed" },
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[1]?.[0]).toContain(
        "/chat/requests/22222222-2222-4222-8222-222222222222/status",
      );
      expect(mockFetch.mock.calls[2]?.[0]).toContain(
        "/chat/conversations/db-conv-1/messages",
      );
    } finally {
      randomUuid.mockRestore();
      vi.useRealTimers();
    }
  });

  it("polls by the client request ID when the accepted event is lost", async () => {
    vi.useFakeTimers();
    const randomUuid = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("11111111-1111-4111-8111-111111111111");

    try {
      const abortError = new DOMException(
        "The operation was aborted.",
        "AbortError",
      );
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(abortError);
        },
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            requestId: "req-client-1",
            conversationId: "db-conv-2",
            status: "completed",
            createdAt: "2026-03-11T10:00:00.000Z",
            updatedAt: "2026-03-11T10:01:00.000Z",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [
            {
              messageId: "msg-1",
              role: "assistant",
              content: "Recovered answer",
              createdAt: "2026-03-11T10:01:00.000Z",
            },
          ],
        });

      const { result } = renderHook(() => useCopilotApi());
      const promise = result.current.sendMessageStreaming(
        "Test",
        "conv-timeout",
        () => {},
      );

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5_000);
      await promise;

      expect(mockFetch.mock.calls[0]?.[1]?.headers["X-Request-ID"]).toBe(
        "11111111-1111-4111-8111-111111111111",
      );
      expect(mockFetch.mock.calls[1]?.[0]).toContain(
        "/chat/requests/11111111-1111-4111-8111-111111111111/status",
      );
    } finally {
      randomUuid.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("ChatApi", () => {
  it("sends CSRF header for archiveConversation patch", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    const { ChatApi } = await import("./use-copilot-api");

    await ChatApi.archiveConversation("conv-42");

    expect(mockGetOrRefreshCsrfToken).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/chat/conversations/conv-42/archive");
    expect(opts.method).toBe("PATCH");
    expect(opts.credentials).toBe("include");
    expect(opts.headers["X-CSRF-Token"]).toBe("csrf-test-token");
  });
});
