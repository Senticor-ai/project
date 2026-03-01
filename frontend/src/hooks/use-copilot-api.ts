import { useCallback } from "react";
import type {
  ChatClientContext,
  ConversationMessageResponse,
  ConversationSummary,
  StreamEvent,
  VisibleWorkspaceItem,
  VisibleWorkspaceSnapshot,
} from "@/model/chat-types";
import { isValidBucket, parsePathname } from "@/lib/route-utils";
import { getOrRefreshCsrfToken } from "@/lib/api-client";

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

function isInViewport(node: HTMLElement): boolean {
  if (node.closest("[hidden],[aria-hidden='true']")) return false;
  const rect = node.getBoundingClientRect();

  // JSDOM fallback: no layout metrics available.
  if (rect.width === 0 && rect.height === 0) return true;

  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < viewportHeight &&
    rect.left < viewportWidth
  );
}

function collectVisibleWorkspaceSnapshot(
  activeBucket: string | null,
  maxItems = 50,
): VisibleWorkspaceSnapshot | undefined {
  if (typeof document === "undefined" || typeof window === "undefined")
    return undefined;

  const contentRoot = document.querySelector<HTMLElement>(
    'main[aria-label="Bucket content"]',
  );
  if (!contentRoot) return undefined;

  const title = contentRoot.querySelector("h1")?.textContent?.trim();
  const items = Array.from(
    document.querySelectorAll<HTMLElement>('[data-copilot-item="true"]'),
  );

  const visibleItems: VisibleWorkspaceItem[] = [];
  for (const node of items) {
    if (!isInViewport(node)) continue;
    const rect = node.getBoundingClientRect();
    visibleItems.push({
      id: node.dataset.copilotItemId,
      type: node.dataset.copilotItemType,
      bucket: node.dataset.copilotItemBucket,
      name: node.dataset.copilotItemName,
      focused: node.dataset.copilotItemFocused === "true",
      top: Number.isFinite(rect.top) ? Math.round(rect.top) : undefined,
    });
  }
  visibleItems.sort((a, b) => (a.top ?? 0) - (b.top ?? 0));

  const bucketNav = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-copilot-bucket-nav-item="true"]',
    ),
  ).map((node) => ({
    bucket: node.dataset.copilotBucket ?? "unknown",
    count: Number.parseInt(node.dataset.copilotBucketCount ?? "0", 10) || 0,
    active: node.dataset.copilotBucketActive === "true",
  }));

  return {
    activeBucket,
    ...(title ? { viewTitle: title } : {}),
    totalVisibleItems: visibleItems.length,
    visibleItems: visibleItems.slice(0, maxItems),
    ...(bucketNav.length > 0 ? { bucketNav } : {}),
  };
}

function getClientContext(
  extraContext?: Partial<ChatClientContext>,
): ChatClientContext {
  const pathname =
    typeof window !== "undefined"
      ? window.location.pathname
      : "/workspace/inbox";
  const parsed = parsePathname(pathname);
  const activeBucket =
    parsed.view === "workspace" && isValidBucket(parsed.sub)
      ? parsed.sub
      : null;

  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    localTime: new Date().toISOString(),
    currentPath:
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : undefined,
    currentUrl:
      typeof window !== "undefined" ? window.location.href : undefined,
    appView: parsed.view,
    appSubView: parsed.sub,
    activeBucket,
    visibleErrors: collectVisibleErrors(),
    visibleWorkspaceSnapshot: collectVisibleWorkspaceSnapshot(activeBucket),
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

type ChatErrorResponse = {
  status: number;
  body?: ReadableStream<Uint8Array> | null;
  text?: () => Promise<string>;
};

function parseErrorDetailFromObject(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const detail = record.detail;
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail.trim();
  }
  if (
    record.type === "error" &&
    typeof record.detail === "string" &&
    record.detail.trim().length > 0
  ) {
    return record.detail.trim();
  }
  return null;
}

function parseErrorDetailFromText(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    const detail = parseErrorDetailFromObject(parsed);
    if (detail) return detail;
  } catch {
    // Not a single JSON object; continue with NDJSON parsing.
  }

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      const detail = parseErrorDetailFromObject(parsed);
      if (detail) return detail;
    } catch {
      // Ignore malformed lines.
    }
  }

  return null;
}

async function extractChatErrorDetail(response: ChatErrorResponse): Promise<string | null> {
  if (typeof response.text === "function") {
    try {
      const detail = parseErrorDetailFromText(await response.text());
      if (detail) return detail;
    } catch {
      // Continue with stream parsing fallback.
    }
  }

  if (response.body) {
    let detail: string | null = null;
    await readNdjsonStream(response.body, (event) => {
      if (detail) return;
      if (event.type === "error" && event.detail.trim().length > 0) {
        detail = event.detail.trim();
      }
    });
    return detail;
  }

  return null;
}

export function useCopilotApi() {
  const sendMessageStreaming = useCallback(
    async (
      message: string,
      conversationId: string,
      onEvent: (event: StreamEvent) => void,
      extraContext?: Partial<ChatClientContext>,
    ): Promise<void> => {
      const csrfToken = await getOrRefreshCsrfToken();
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          message,
          conversationId,
          context: getClientContext(extraContext),
        }),
      });

      if (!res.ok) {
        const detail = await extractChatErrorDetail(res as ChatErrorResponse);
        throw new Error(detail ?? `Chat request failed: ${res.status}`);
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
    const csrfToken = await getOrRefreshCsrfToken();
    const res = await fetch(
      `${API_BASE}/chat/conversations/${conversationId}/archive`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      },
    );
    if (!res.ok)
      throw new Error(`Failed to archive conversation: ${res.status}`);
  },
};
