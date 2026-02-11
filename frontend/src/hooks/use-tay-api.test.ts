import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTayApi } from "./use-tay-api";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useTayApi", () => {
  it("sends POST to /chat/completions with message and conversationId", async () => {
    mockFetch.mockReturnValue(jsonResponse({ text: "OK" }));
    const { result } = renderHook(() => useTayApi());

    await result.current.sendMessage("Hallo", "conv-123");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/chat/completions");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.credentials).toBe("include");
    expect(JSON.parse(opts.body as string)).toEqual({
      message: "Hallo",
      conversationId: "conv-123",
    });
  });

  it("returns parsed response with text", async () => {
    mockFetch.mockReturnValue(jsonResponse({ text: "Antwort" }));
    const { result } = renderHook(() => useTayApi());

    const response = await result.current.sendMessage("Hi", "conv-1");

    expect(response.text).toBe("Antwort");
    expect(response.toolCalls).toBeUndefined();
  });

  it("returns response with toolCalls", async () => {
    const body = {
      text: "Vorschlag:",
      toolCalls: [
        {
          name: "create_action",
          arguments: { type: "create_action", name: "Task", bucket: "next" },
        },
      ],
    };
    mockFetch.mockReturnValue(jsonResponse(body));
    const { result } = renderHook(() => useTayApi());

    const response = await result.current.sendMessage("Test", "conv-1");

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0]!.name).toBe("create_action");
  });

  it("throws on non-ok response with status code", async () => {
    mockFetch.mockReturnValue(jsonResponse(null, false, 500));
    const { result } = renderHook(() => useTayApi());

    await expect(result.current.sendMessage("Test", "conv-1")).rejects.toThrow(
      "Chat request failed: 500",
    );
  });

  it("throws on network error", async () => {
    mockFetch.mockReturnValue(Promise.reject(new Error("Network error")));
    const { result } = renderHook(() => useTayApi());

    await expect(result.current.sendMessage("Test", "conv-1")).rejects.toThrow(
      "Network error",
    );
  });
});
