import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderHook,
  act,
  waitFor,
  type RenderHookResult,
} from "@testing-library/react";
import { useChatState } from "./use-chat-state";
import type {
  ChatMessage,
  StreamEvent,
  TaySuggestionMessage,
} from "@/model/chat-types";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockSendMessageStreaming: ReturnType<typeof vi.fn> = vi.fn();
const mockExecuteSuggestion: ReturnType<typeof vi.fn> = vi.fn();

vi.mock("./use-tay-api", () => ({
  useTayApi: () => ({ sendMessageStreaming: mockSendMessageStreaming }),
}));

vi.mock("./use-tay-actions", () => ({
  useTayActions: () => ({ executeSuggestion: mockExecuteSuggestion }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ChatHookResult = RenderHookResult<
  ReturnType<typeof useChatState>,
  unknown
>;

function findByKind<K extends ChatMessage["kind"]>(
  messages: ChatMessage[],
  kind: K,
): Extract<ChatMessage, { kind: K }>[] {
  return messages.filter(
    (m): m is Extract<ChatMessage, { kind: K }> => m.kind === kind,
  );
}

/** Send a message and wait for the response to settle. */
async function sendAndWait(hook: ChatHookResult, text: string) {
  await act(async () => {
    await hook.result.current.sendMessage(text);
  });
  await waitFor(() => {
    expect(hook.result.current.isLoading).toBe(false);
  });
}

/**
 * Set up a pending suggestion by sending a message that returns a tool call,
 * then return the suggestion message ID.
 */
async function setupSuggestion(hook: ChatHookResult): Promise<string> {
  mockSendMessageStreaming.mockImplementationOnce(
    (
      _message: string,
      _conversationId: string,
      onEvent: (event: StreamEvent) => void,
    ) => {
      onEvent({ type: "text_delta", content: "Vorschlag:" });
      onEvent({
        type: "tool_calls",
        toolCalls: [
          {
            name: "create_action",
            arguments: {
              type: "create_action" as const,
              name: "Testaufgabe",
              bucket: "next" as const,
            },
          },
        ],
      });
      onEvent({ type: "done", text: "Vorschlag:" });
      return Promise.resolve();
    },
  );

  await sendAndWait(hook, "Erstelle eine Aufgabe");

  const suggestions = findByKind(hook.result.current.messages, "suggestion");
  return suggestions[0]!.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  // Default: simple text response
  mockSendMessageStreaming.mockImplementation(
    (
      _message: string,
      _conversationId: string,
      onEvent: (event: StreamEvent) => void,
    ) => {
      onEvent({ type: "text_delta", content: "OK" });
      onEvent({ type: "done", text: "OK" });
      return Promise.resolve();
    },
  );
  mockExecuteSuggestion.mockResolvedValue([]);
});

describe("useChatState", () => {
  describe("sendMessage", () => {
    it("adds user message and thinking indicator when sending", async () => {
      // Use a never-resolving promise so we can inspect mid-flight state
      let resolve!: () => void;
      mockSendMessageStreaming.mockReturnValueOnce(
        new Promise<void>((r) => {
          resolve = r;
        }),
      );

      const hook = renderHook(() => useChatState());

      // Start sending without awaiting
      act(() => {
        void hook.result.current.sendMessage("Hallo");
      });

      // Mid-flight: user message + thinking
      await waitFor(() => {
        expect(hook.result.current.isLoading).toBe(true);
      });
      const userMsgs = findByKind(hook.result.current.messages, "text").filter(
        (m) => m.role === "user",
      );
      expect(userMsgs).toHaveLength(1);
      expect(userMsgs[0]!.content).toBe("Hallo");
      expect(findByKind(hook.result.current.messages, "thinking")).toHaveLength(
        1,
      );

      // Clean up
      await act(async () => {
        resolve();
      });
    });

    it("sets isLoading true during send, false after", async () => {
      const hook = renderHook(() => useChatState());

      expect(hook.result.current.isLoading).toBe(false);

      await act(async () => {
        await hook.result.current.sendMessage("Test");
      });

      expect(hook.result.current.isLoading).toBe(false);
    });

    it("replaces thinking with streamed text response on text_delta", async () => {
      mockSendMessageStreaming.mockImplementationOnce(
        (
          _message: string,
          _conversationId: string,
          onEvent: (event: StreamEvent) => void,
        ) => {
          onEvent({ type: "text_delta", content: "Ant" });
          onEvent({ type: "text_delta", content: "wort" });
          onEvent({ type: "done", text: "Antwort" });
          return Promise.resolve();
        },
      );
      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Test");

      expect(findByKind(hook.result.current.messages, "thinking")).toHaveLength(
        0,
      );

      const tayTexts = findByKind(hook.result.current.messages, "text").filter(
        (m) => m.role === "tay",
      );
      expect(tayTexts).toHaveLength(1);
      expect(tayTexts[0]!.content).toBe("Antwort");
    });

    it("marks streaming message as not streaming after done event", async () => {
      mockSendMessageStreaming.mockImplementationOnce(
        (
          _message: string,
          _conversationId: string,
          onEvent: (event: StreamEvent) => void,
        ) => {
          onEvent({ type: "text_delta", content: "Hello" });
          onEvent({ type: "done", text: "Hello" });
          return Promise.resolve();
        },
      );
      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Test");

      const tayTexts = findByKind(hook.result.current.messages, "text").filter(
        (m) => m.role === "tay",
      );
      expect(tayTexts[0]!.isStreaming).toBeFalsy();
    });

    it("adds suggestion cards when tool_calls event arrives", async () => {
      mockSendMessageStreaming.mockImplementationOnce(
        (
          _message: string,
          _conversationId: string,
          onEvent: (event: StreamEvent) => void,
        ) => {
          onEvent({ type: "text_delta", content: "Vorschlag:" });
          onEvent({
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
          });
          onEvent({ type: "done", text: "Vorschlag:" });
          return Promise.resolve();
        },
      );

      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Erstelle");

      const tayTexts = findByKind(hook.result.current.messages, "text").filter(
        (m) => m.role === "tay",
      );
      expect(tayTexts).toHaveLength(1);
      expect(tayTexts[0]!.content).toBe("Vorschlag:");

      const suggestions = findByKind(
        hook.result.current.messages,
        "suggestion",
      );
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]!.status).toBe("pending");
    });

    it("infers suggestion type from tool name when missing in arguments", async () => {
      mockSendMessageStreaming.mockImplementationOnce(
        (
          _message: string,
          _conversationId: string,
          onEvent: (event: StreamEvent) => void,
        ) => {
          onEvent({
            type: "tool_calls",
            toolCalls: [
              {
                name: "create_project_with_actions",
                arguments: {
                  // no `type` field — LLM omitted it
                  project: {
                    name: "Geburtstagsfeier",
                    desiredOutcome: "Tolle Party",
                  },
                  actions: [{ name: "Gäste einladen", bucket: "next" }],
                },
              },
            ],
          } as StreamEvent);
          onEvent({ type: "done", text: "" });
          return Promise.resolve();
        },
      );

      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Geburtstag planen");

      const suggestions = findByKind(
        hook.result.current.messages,
        "suggestion",
      );
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]!.suggestion.type).toBe(
        "create_project_with_actions",
      );
    });

    it("handles response with only toolCalls and no text", async () => {
      mockSendMessageStreaming.mockImplementationOnce(
        (
          _message: string,
          _conversationId: string,
          onEvent: (event: StreamEvent) => void,
        ) => {
          onEvent({
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
          });
          onEvent({ type: "done", text: "" });
          return Promise.resolve();
        },
      );

      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Action");

      const tayTexts = findByKind(hook.result.current.messages, "text").filter(
        (m) => m.role === "tay",
      );
      expect(tayTexts).toHaveLength(0);

      const suggestions = findByKind(
        hook.result.current.messages,
        "suggestion",
      );
      expect(suggestions).toHaveLength(1);
    });

    it("shows full text from done event when no text_delta received (cache hit)", async () => {
      mockSendMessageStreaming.mockImplementationOnce(
        (
          _message: string,
          _conversationId: string,
          onEvent: (event: StreamEvent) => void,
        ) => {
          // Cache hit: no text_delta, only done with full text
          onEvent({ type: "done", text: "Cached response" });
          return Promise.resolve();
        },
      );

      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Test");

      const tayTexts = findByKind(hook.result.current.messages, "text").filter(
        (m) => m.role === "tay",
      );
      expect(tayTexts).toHaveLength(1);
      expect(tayTexts[0]!.content).toBe("Cached response");
      expect(findByKind(hook.result.current.messages, "thinking")).toHaveLength(
        0,
      );
    });

    it("handles error event from stream", async () => {
      mockSendMessageStreaming.mockImplementationOnce(
        (
          _message: string,
          _conversationId: string,
          onEvent: (event: StreamEvent) => void,
        ) => {
          onEvent({ type: "error", detail: "Agents service unreachable" });
          return Promise.resolve();
        },
      );

      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Test");

      expect(findByKind(hook.result.current.messages, "thinking")).toHaveLength(
        0,
      );
      const errors = findByKind(hook.result.current.messages, "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.content).toBe("Agents service unreachable");
    });

    it("replaces thinking with error message on fetch failure", async () => {
      mockSendMessageStreaming.mockRejectedValueOnce(new Error("API down"));
      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Test");

      expect(findByKind(hook.result.current.messages, "thinking")).toHaveLength(
        0,
      );

      const errors = findByKind(hook.result.current.messages, "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.content).toBe(
        "Es ist ein Fehler aufgetreten. Bitte versuche es erneut.",
      );
      expect(hook.result.current.isLoading).toBe(false);
    });

    it("preserves existing messages across multiple sends", async () => {
      mockSendMessageStreaming
        .mockImplementationOnce(
          (
            _message: string,
            _conversationId: string,
            onEvent: (event: StreamEvent) => void,
          ) => {
            onEvent({ type: "text_delta", content: "Erste Antwort" });
            onEvent({ type: "done", text: "Erste Antwort" });
            return Promise.resolve();
          },
        )
        .mockImplementationOnce(
          (
            _message: string,
            _conversationId: string,
            onEvent: (event: StreamEvent) => void,
          ) => {
            onEvent({ type: "text_delta", content: "Zweite Antwort" });
            onEvent({ type: "done", text: "Zweite Antwort" });
            return Promise.resolve();
          },
        );

      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Erste Nachricht");
      await sendAndWait(hook, "Zweite Nachricht");

      const userMsgs = hook.result.current.messages.filter(
        (m) => m.role === "user",
      );
      const tayMsgs = findByKind(hook.result.current.messages, "text").filter(
        (m) => m.role === "tay",
      );
      expect(userMsgs).toHaveLength(2);
      expect(tayMsgs).toHaveLength(2);
    });

    it("passes conversationId to streaming API", async () => {
      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Test");

      expect(mockSendMessageStreaming).toHaveBeenCalledWith(
        "Test",
        hook.result.current.conversationId,
        expect.any(Function),
      );
    });

    it("removes thinking indicator if no events arrive", async () => {
      // sendMessageStreaming resolves without calling onEvent at all
      mockSendMessageStreaming.mockImplementationOnce(() => Promise.resolve());

      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Test");

      expect(findByKind(hook.result.current.messages, "thinking")).toHaveLength(
        0,
      );
    });
  });

  describe("acceptSuggestion", () => {
    it("marks suggestion as accepted optimistically", async () => {
      // Use a never-resolving promise for executeSuggestion
      let resolveExec!: (v: unknown[]) => void;
      mockExecuteSuggestion.mockReturnValueOnce(
        new Promise((r) => {
          resolveExec = r;
        }),
      );

      const hook = renderHook(() => useChatState());
      const suggestionId = await setupSuggestion(hook);

      // Start acceptance without awaiting
      act(() => {
        void hook.result.current.acceptSuggestion(suggestionId);
      });

      // Check optimistic update
      await waitFor(() => {
        const s = hook.result.current.messages.find(
          (m) => m.id === suggestionId,
        ) as TaySuggestionMessage;
        expect(s.status).toBe("accepted");
      });

      // Clean up
      await act(async () => {
        resolveExec([]);
      });
    });

    it("adds confirmation message after successful execution", async () => {
      mockExecuteSuggestion.mockResolvedValueOnce([
        {
          canonicalId: "urn:app:action:1",
          name: "Testaufgabe",
          type: "action",
        },
      ]);

      const hook = renderHook(() => useChatState());
      const suggestionId = await setupSuggestion(hook);

      await act(async () => {
        await hook.result.current.acceptSuggestion(suggestionId);
      });

      const confirmations = findByKind(
        hook.result.current.messages,
        "confirmation",
      );
      expect(confirmations).toHaveLength(1);
      expect(confirmations[0]!.content).toContain("Aktion");
    });

    it("reverts suggestion to pending on execution error", async () => {
      mockExecuteSuggestion.mockRejectedValueOnce(new Error("Fail"));

      const hook = renderHook(() => useChatState());
      const suggestionId = await setupSuggestion(hook);

      await act(async () => {
        await hook.result.current.acceptSuggestion(suggestionId);
      });

      const s = hook.result.current.messages.find(
        (m) => m.id === suggestionId,
      ) as TaySuggestionMessage;
      expect(s.status).toBe("pending");
    });

    it("passes conversationId to executeSuggestion", async () => {
      mockExecuteSuggestion.mockResolvedValueOnce([
        {
          canonicalId: "urn:app:action:1",
          name: "Testaufgabe",
          type: "action",
        },
      ]);

      const hook = renderHook(() => useChatState());
      const suggestionId = await setupSuggestion(hook);

      await act(async () => {
        await hook.result.current.acceptSuggestion(suggestionId);
      });

      expect(mockExecuteSuggestion).toHaveBeenCalledWith(
        expect.objectContaining({ type: "create_action" }),
        hook.result.current.conversationId,
      );
    });

    it("does nothing for unknown messageId", async () => {
      const hook = renderHook(() => useChatState());

      const before = [...hook.result.current.messages];

      await act(async () => {
        await hook.result.current.acceptSuggestion("nonexistent-id");
      });

      expect(hook.result.current.messages).toEqual(before);
      expect(mockExecuteSuggestion).not.toHaveBeenCalled();
    });
  });

  describe("dismissSuggestion", () => {
    it("marks suggestion as dismissed", async () => {
      const hook = renderHook(() => useChatState());
      const suggestionId = await setupSuggestion(hook);

      act(() => {
        hook.result.current.dismissSuggestion(suggestionId);
      });

      const s = hook.result.current.messages.find(
        (m) => m.id === suggestionId,
      ) as TaySuggestionMessage;
      expect(s.status).toBe("dismissed");
    });

    it("does not affect other messages", async () => {
      const hook = renderHook(() => useChatState());
      const suggestionId = await setupSuggestion(hook);

      const otherMsgCount = hook.result.current.messages.filter(
        (m) => m.id !== suggestionId,
      ).length;

      act(() => {
        hook.result.current.dismissSuggestion(suggestionId);
      });

      const others = hook.result.current.messages.filter(
        (m) => m.id !== suggestionId,
      );
      expect(others).toHaveLength(otherMsgCount);
      expect(others.some((m) => m.role === "user")).toBe(true);
    });
  });
});
