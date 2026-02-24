import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCopilotApi, readNdjsonStream } from "./use-copilot-api";
import type { StreamEvent } from "@/model/chat-types";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.resetAllMocks();
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
    expect(opts.credentials).toBe("include");
    const body = JSON.parse(opts.body as string);
    expect(body.message).toBe("Hallo");
    expect(body.conversationId).toBe("conv-123");
    expect(body.context).toEqual({
      timezone: expect.any(String),
      locale: expect.any(String),
      localTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
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

  it("throws on non-ok response with status code", async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({ ok: false, status: 500, body: null }),
    );
    const { result } = renderHook(() => useCopilotApi());

    await expect(
      result.current.sendMessageStreaming("Test", "conv-1", () => {}),
    ).rejects.toThrow("Chat request failed: 500");
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
});
