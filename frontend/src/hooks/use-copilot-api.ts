import { useCallback } from "react";
import type {
  ChatClientContext,
  ConversationMessageResponse,
  ConversationSummary,
  StreamEvent,
} from "@/model/chat-types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function getClientContext(): ChatClientContext {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    localTime: new Date().toISOString(),
  };
}

/**
 * Parse NDJSON lines from a ReadableStream, calling onEvent for each.
 */
export async function readNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          onEvent(JSON.parse(trimmed) as StreamEvent);
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      try {
        onEvent(JSON.parse(buffer.trim()) as StreamEvent);
      } catch {
        // Skip
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function useCopilotApi() {
  const sendMessageStreaming = useCallback(
    async (
      message: string,
      conversationId: string,
      onEvent: (event: StreamEvent) => void,
    ): Promise<void> => {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message,
          conversationId,
          context: getClientContext(),
        }),
      });

      if (!res.ok) {
        throw new Error(`Chat request failed: ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body for streaming");
      }

      await readNdjsonStream(res.body, onEvent);
    },
    [],
  );

  return { sendMessageStreaming };
}

// ---------------------------------------------------------------------------
// Conversation management API (non-hook, used by components)
// ---------------------------------------------------------------------------

export const ChatApi = {
  async listConversations(): Promise<ConversationSummary[]> {
    const res = await fetch(`${API_BASE}/chat/conversations`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Failed to list conversations: ${res.status}`);
    return res.json() as Promise<ConversationSummary[]>;
  },

  async getConversationMessages(
    conversationId: string,
  ): Promise<ConversationMessageResponse[]> {
    const res = await fetch(
      `${API_BASE}/chat/conversations/${conversationId}/messages`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error(`Failed to get messages: ${res.status}`);
    return res.json() as Promise<ConversationMessageResponse[]>;
  },

  async archiveConversation(conversationId: string): Promise<void> {
    const res = await fetch(
      `${API_BASE}/chat/conversations/${conversationId}/archive`,
      { method: "PATCH", credentials: "include" },
    );
    if (!res.ok)
      throw new Error(`Failed to archive conversation: ${res.status}`);
  },
};
