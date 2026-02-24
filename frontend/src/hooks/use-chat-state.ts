import { useState, useCallback } from "react";
import type {
  ChatMessage,
  ChatClientContext,
  UserChatMessage,
  CopilotTextMessage,
  CopilotThinkingMessage,
  CopilotSuggestionMessage,
  CopilotConfirmationMessage,
  CopilotErrorMessage,
  CopilotSuggestion,
  CreatedItemRef,
  StreamEvent,
} from "@/model/chat-types";
import { useCopilotApi } from "./use-copilot-api";
import { useCopilotActions } from "./use-copilot-actions";

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function newConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type ChatStateOptions = {
  getClientContext?: () => Partial<ChatClientContext>;
};

export function useChatState(options: ChatStateOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(newConversationId);
  const { sendMessageStreaming } = useCopilotApi();
  const { executeSuggestion, onItemsChanged } = useCopilotActions();
  const getClientContext = options.getClientContext;

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: UserChatMessage = {
        id: generateId(),
        role: "user",
        kind: "text",
        content: text,
        timestamp: new Date().toISOString(),
      };

      const thinkingMsg: CopilotThinkingMessage = {
        id: generateId(),
        role: "copilot",
        kind: "thinking",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, thinkingMsg]);
      setIsLoading(true);

      // Track streaming text message ID so we can append to it
      let streamingMsgId: string | null = null;

      try {
        const onEvent = (event: StreamEvent) => {
          switch (event.type) {
            case "text_delta": {
              if (!streamingMsgId) {
                // First text chunk — replace thinking indicator with streaming text
                streamingMsgId = generateId();
                const initialMsg: CopilotTextMessage = {
                  id: streamingMsgId,
                  role: "copilot",
                  kind: "text",
                  content: event.content,
                  isStreaming: true,
                  timestamp: new Date().toISOString(),
                };
                setMessages((prev) => {
                  const withoutThinking = prev.filter(
                    (m) => m.id !== thinkingMsg.id,
                  );
                  return [...withoutThinking, initialMsg];
                });
              } else {
                // Append to existing streaming message
                const msgId = streamingMsgId;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId && m.kind === "text"
                      ? { ...m, content: m.content + event.content }
                      : m,
                  ),
                );
              }
              break;
            }

            case "tool_calls": {
              // Add suggestion cards for tool calls (Haystack approval flow)
              const newSuggestions: ChatMessage[] = [];
              for (const tc of event.toolCalls) {
                const args = { ...tc.arguments, type: tc.name };
                const suggestion: CopilotSuggestionMessage = {
                  id: generateId(),
                  role: "copilot",
                  kind: "suggestion",
                  suggestion: args as CopilotSuggestion,
                  status: "pending",
                  timestamp: new Date().toISOString(),
                };
                newSuggestions.push(suggestion);
              }
              setMessages((prev) => [...prev, ...newSuggestions]);
              break;
            }

            case "auto_executed": {
              // OpenClaw path: tool already executed, show confirmation directly
              const confirmation: CopilotConfirmationMessage = {
                id: generateId(),
                role: "copilot",
                kind: "confirmation",
                content: buildConfirmationText(event.createdItems),
                createdItems: event.createdItems,
                timestamp: new Date().toISOString(),
              };
              setMessages((prev) => {
                const withoutThinking = prev.filter(
                  (m) => m.id !== thinkingMsg.id,
                );
                return [...withoutThinking, confirmation];
              });
              break;
            }

            case "items_changed": {
              void onItemsChanged();
              break;
            }

            case "done": {
              // Finalize: mark streaming as done, ensure text is complete
              if (streamingMsgId) {
                const msgId = streamingMsgId;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === msgId && m.kind === "text"
                      ? { ...m, isStreaming: false }
                      : m,
                  ),
                );
              } else if (event.text) {
                // No streaming chunks received (e.g. cache hit) — show full text
                const fullTextMsg: CopilotTextMessage = {
                  id: generateId(),
                  role: "copilot",
                  kind: "text",
                  content: event.text,
                  timestamp: new Date().toISOString(),
                };
                setMessages((prev) => {
                  const withoutThinking = prev.filter(
                    (m) => m.id !== thinkingMsg.id,
                  );
                  return [...withoutThinking, fullTextMsg];
                });
              }
              break;
            }

            case "error": {
              const errorMsg: CopilotErrorMessage = {
                id: generateId(),
                role: "copilot",
                kind: "error",
                content: event.detail,
                timestamp: new Date().toISOString(),
              };
              setMessages((prev) => {
                const withoutThinking = prev.filter(
                  (m) => m.id !== thinkingMsg.id,
                );
                return [...withoutThinking, errorMsg];
              });
              break;
            }
          }
        };

        await sendMessageStreaming(
          text,
          conversationId,
          onEvent,
          getClientContext?.(),
        );

        // If no events arrived at all, remove thinking indicator
        if (!streamingMsgId) {
          setMessages((prev) => prev.filter((m) => m.id !== thinkingMsg.id));
        }
      } catch {
        setMessages((prev) => {
          const withoutThinking = prev.filter((m) => m.id !== thinkingMsg.id);
          const errorMsg: CopilotErrorMessage = {
            id: generateId(),
            role: "copilot",
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
    [sendMessageStreaming, onItemsChanged, conversationId, getClientContext],
  );

  const acceptSuggestion = useCallback(
    async (messageId: string) => {
      // Find the suggestion message
      const suggestionMsg = messages.find(
        (m) => m.id === messageId && m.kind === "suggestion",
      ) as CopilotSuggestionMessage | undefined;

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
        const createdItems = await executeSuggestion(
          suggestionMsg.suggestion,
          conversationId,
        );

        // Add confirmation message
        const confirmation: CopilotConfirmationMessage = {
          id: generateId(),
          role: "copilot",
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
    [messages, executeSuggestion, conversationId],
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

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(newConversationId());
  }, []);

  const loadConversation = useCallback(
    (id: string, restoredMessages: ChatMessage[]) => {
      setConversationId(id);
      setMessages(restoredMessages);
    },
    [],
  );

  return {
    messages,
    isLoading,
    conversationId,
    sendMessage,
    acceptSuggestion,
    dismissSuggestion,
    startNewConversation,
    loadConversation,
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
