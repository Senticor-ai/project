import { useCallback } from "react";
import type {
  ChatClientContext,
  ConversationMessageResponse,
  ConversationSummary,
  StreamEvent,
} from "@/model/chat-types";
import { isValidBucket, parsePathname } from "@/lib/route-utils";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(
  /\/+$/,
  "",
);

function collectVisibleErrors(maxCount = 5): string[] {
  if (typeof document === "undefined") return [];

  const selectors = [
    '[role="alert"]',
    '[aria-live="assertive"]',
    "[data-copilot-context-error]",
    ".text-status-error",
    ".text-red-600",
  ].join(",");

  const seen = new Set<string>();
  const out: string[] = [];

  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selectors));
  for (const node of nodes) {
    if (node.closest("[hidden],[aria-hidden='true']")) continue;
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length < 8 || text.length > 280) continue;
    if (/^(fehler|error)$/i.test(text)) continue;
    if (/^\d+\s+errors?$/i.test(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= maxCount) break;
  }

  return out;
}

function getClientContext(
  extraContext?: Partial<ChatClientContext>,
): ChatClientContext {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/workspace/inbox";
  const parsed = parsePathname(pathname);
  const activeBucket =
    parsed.view === "workspace" && isValidBucket(parsed.sub) ? parsed.sub : null;

  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    localTime: new Date().toISOString(),
    currentPath:
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : undefined,
    currentUrl: typeof window !== "undefined" ? window.location.href : undefined,
    appView: parsed.view,
    appSubView: parsed.sub,
    activeBucket,
    visibleErrors: collectVisibleErrors(),
    ...extraContext,
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
      extraContext?: Partial<ChatClientContext>,
    ): Promise<void> => {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message,
          conversationId,
          context: getClientContext(extraContext),
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
