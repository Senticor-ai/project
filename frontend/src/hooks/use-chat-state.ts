import { useState, useCallback, useRef } from "react";
import type {
  ChatMessage,
  UserChatMessage,
  TayTextMessage,
  TayThinkingMessage,
  TaySuggestionMessage,
  TayConfirmationMessage,
  TayErrorMessage,
  TaySuggestion,
  CreatedItemRef,
} from "@/model/chat-types";
import { useTayApi } from "./use-tay-api";
import { useTayActions } from "./use-tay-actions";

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useChatState() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const conversationIdRef = useRef(
    `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  );
  const { sendMessage: apiSend } = useTayApi();
  const { executeSuggestion } = useTayActions();

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: UserChatMessage = {
        id: generateId(),
        role: "user",
        kind: "text",
        content: text,
        timestamp: new Date().toISOString(),
      };

      const thinkingMsg: TayThinkingMessage = {
        id: generateId(),
        role: "tay",
        kind: "thinking",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, thinkingMsg]);
      setIsLoading(true);

      try {
        const response = await apiSend(text, conversationIdRef.current);

        setMessages((prev) => {
          // Remove thinking indicator
          const withoutThinking = prev.filter((m) => m.id !== thinkingMsg.id);

          const newMessages: ChatMessage[] = [];

          // Add text response
          if (response.text) {
            const tayText: TayTextMessage = {
              id: generateId(),
              role: "tay",
              kind: "text",
              content: response.text,
              timestamp: new Date().toISOString(),
            };
            newMessages.push(tayText);
          }

          // Add suggestion cards for tool calls
          if (response.toolCalls) {
            for (const tc of response.toolCalls) {
              const suggestion: TaySuggestionMessage = {
                id: generateId(),
                role: "tay",
                kind: "suggestion",
                suggestion: tc.arguments as TaySuggestion,
                status: "pending",
                timestamp: new Date().toISOString(),
              };
              newMessages.push(suggestion);
            }
          }

          return [...withoutThinking, ...newMessages];
        });
      } catch {
        setMessages((prev) => {
          const withoutThinking = prev.filter((m) => m.id !== thinkingMsg.id);
          const errorMsg: TayErrorMessage = {
            id: generateId(),
            role: "tay",
            kind: "error",
            content: "Es ist ein Fehler aufgetreten. Bitte versuche es erneut.",
            timestamp: new Date().toISOString(),
          };
          return [...withoutThinking, errorMsg];
        });
      } finally {
        setIsLoading(false);
      }
    },
    [apiSend],
  );

  const acceptSuggestion = useCallback(
    async (messageId: string) => {
      // Find the suggestion message
      const suggestionMsg = messages.find(
        (m) => m.id === messageId && m.kind === "suggestion",
      ) as TaySuggestionMessage | undefined;

      if (!suggestionMsg) return;

      // Mark as accepted optimistically
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.kind === "suggestion"
            ? { ...m, status: "accepted" as const }
            : m,
        ),
      );

      try {
        const createdItems = await executeSuggestion(suggestionMsg.suggestion);

        // Add confirmation message
        const confirmation: TayConfirmationMessage = {
          id: generateId(),
          role: "tay",
          kind: "confirmation",
          content: buildConfirmationText(createdItems),
          createdItems,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, confirmation]);
      } catch {
        // Revert to pending on error
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId && m.kind === "suggestion"
              ? { ...m, status: "pending" as const }
              : m,
          ),
        );
      }
    },
    [messages, executeSuggestion],
  );

  const dismissSuggestion = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.kind === "suggestion"
          ? { ...m, status: "dismissed" as const }
          : m,
      ),
    );
  }, []);

  return {
    messages,
    isLoading,
    conversationId: conversationIdRef.current,
    sendMessage,
    acceptSuggestion,
    dismissSuggestion,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildConfirmationText(items: CreatedItemRef[]): string {
  const projects = items.filter((i) => i.type === "project");
  const actions = items.filter((i) => i.type === "action");
  const refs = items.filter((i) => i.type === "reference");

  const parts: string[] = [];

  if (projects.length === 1) {
    parts.push(`Projekt '${projects[0]!.name}' erstellt`);
  }
  if (actions.length > 0) {
    parts.push(`${actions.length} Aktion${actions.length === 1 ? "" : "en"}`);
  }
  if (refs.length > 0) {
    parts.push(`${refs.length} Dokument${refs.length === 1 ? "" : "e"}`);
  }

  if (projects.length === 1 && (actions.length > 0 || refs.length > 0)) {
    return `${parts[0]} mit ${parts.slice(1).join(" und ")}.`;
  }

  return parts.join(", ") + ".";
}
