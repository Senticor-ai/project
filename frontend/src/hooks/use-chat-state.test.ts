import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderHook,
  act,
  waitFor,
  type RenderHookResult,
} from "@testing-library/react";
import { useChatState } from "./use-chat-state";
import type {
  ChatCompletionResponse,
  ChatMessage,
  TaySuggestionMessage,
} from "@/model/chat-types";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockApiSend: ReturnType<typeof vi.fn> = vi.fn();
const mockExecuteSuggestion: ReturnType<typeof vi.fn> = vi.fn();

vi.mock("./use-tay-api", () => ({
  useTayApi: () => ({ sendMessage: mockApiSend }),
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
  mockApiSend.mockResolvedValueOnce({
    text: "Vorschlag:",
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
  } satisfies ChatCompletionResponse);

  await sendAndWait(hook, "Erstelle eine Aufgabe");

  const suggestions = findByKind(hook.result.current.messages, "suggestion");
  return suggestions[0]!.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  mockApiSend.mockResolvedValue({
    text: "OK",
  } satisfies ChatCompletionResponse);
  mockExecuteSuggestion.mockResolvedValue([]);
});

describe("useChatState", () => {
  describe("sendMessage", () => {
    it("adds user message and thinking indicator when sending", async () => {
      // Use a never-resolving promise so we can inspect mid-flight state
      let resolve!: (v: ChatCompletionResponse) => void;
      mockApiSend.mockReturnValueOnce(
        new Promise<ChatCompletionResponse>((r) => {
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
        resolve({ text: "Done" });
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

    it("replaces thinking with text response on success", async () => {
      mockApiSend.mockResolvedValueOnce({
        text: "Antwort",
      } satisfies ChatCompletionResponse);
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

    it("replaces thinking with text + suggestion when toolCalls present", async () => {
      mockApiSend.mockResolvedValueOnce({
        text: "Vorschlag:",
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
      } satisfies ChatCompletionResponse);

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

    it("handles response with only toolCalls and no text", async () => {
      mockApiSend.mockResolvedValueOnce({
        text: "",
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
      } satisfies ChatCompletionResponse);

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

    it("replaces thinking with error message on failure", async () => {
      mockApiSend.mockRejectedValueOnce(new Error("API down"));
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
      mockApiSend
        .mockResolvedValueOnce({
          text: "Erste Antwort",
        } satisfies ChatCompletionResponse)
        .mockResolvedValueOnce({
          text: "Zweite Antwort",
        } satisfies ChatCompletionResponse);

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

    it("passes conversationId to API", async () => {
      const hook = renderHook(() => useChatState());

      await sendAndWait(hook, "Test");

      expect(mockApiSend).toHaveBeenCalledWith(
        "Test",
        hook.result.current.conversationId,
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
