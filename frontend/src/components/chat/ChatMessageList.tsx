import { useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessage, CopilotSuggestionMessage } from "@/model/chat-types";
import {
  UserMessageBubble,
  CopilotMessageBubble,
  CopilotThinkingIndicator,
  CopilotConfirmation,
} from "./ChatBubbles";
import { CopilotSuggestionCard } from "./CopilotSuggestionCard";
import { Icon } from "@/components/ui/Icon";

export interface ChatMessageListProps {
  messages: ChatMessage[];
  onAcceptSuggestion?: (messageId: string) => void;
  onDismissSuggestion?: (messageId: string) => void;
  onAcceptAllSuggestions?: (messageIds: string[]) => void;
  onDismissAllSuggestions?: (messageIds: string[]) => void;
  onItemClick?: (canonicalId: string) => void;
  agentName?: string;
  className?: string;
}

/**
 * Groups consecutive suggestion messages into batches.
 * Returns a map from the first message ID in each group to the group's message IDs.
 */
function groupConsecutiveSuggestions(
  messages: ChatMessage[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let currentGroup: CopilotSuggestionMessage[] = [];

  for (const msg of messages) {
    if (msg.kind === "suggestion") {
      currentGroup.push(msg);
    } else {
      if (currentGroup.length >= 2) {
        const ids = currentGroup.map((m) => m.id);
        groups.set(ids[0]!, ids);
      }
      currentGroup = [];
    }
  }
  // Flush trailing group
  if (currentGroup.length >= 2) {
    const ids = currentGroup.map((m) => m.id);
    groups.set(ids[0]!, ids);
  }

  return groups;
}

export function ChatMessageList({
  messages,
  onAcceptSuggestion,
  onDismissSuggestion,
  onAcceptAllSuggestions,
  onDismissAllSuggestions,
  onItemClick,
  agentName = "Copilot",
  className,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages.length]);

  // Group consecutive suggestions for batch actions
  const suggestionGroups = useMemo(
    () => groupConsecutiveSuggestions(messages),
    [messages],
  );

  if (messages.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-3 text-center",
          className,
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blueprint-100">
          <Icon name="chat_bubble" size={24} className="text-blueprint-500" />
        </div>
        <p className="text-sm text-text-muted">
          Hallo! Ich bin {agentName}. Wie kann ich helfen?
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-1 flex-col gap-3 overflow-y-auto", className)}
    >
      {messages.map((msg) => {
        const groupIds = suggestionGroups.get(msg.id);
        const hasPending =
          groupIds?.some((id) => {
            const m = messages.find((x) => x.id === id);
            return m?.kind === "suggestion" && m.status === "pending";
          }) ?? false;

        return (
          <div key={msg.id}>
            {/* Batch action bar at the start of a suggestion group */}
            {groupIds && hasPending && (
              <SuggestionGroupActions
                count={
                  groupIds.filter((id) => {
                    const m = messages.find((x) => x.id === id);
                    return m?.kind === "suggestion" && m.status === "pending";
                  }).length
                }
                onAcceptAll={() => onAcceptAllSuggestions?.(groupIds)}
                onDismissAll={() => onDismissAllSuggestions?.(groupIds)}
              />
            )}
            <ChatMessageRenderer
              message={msg}
              onAcceptSuggestion={onAcceptSuggestion}
              onDismissSuggestion={onDismissSuggestion}
              onItemClick={onItemClick}
              agentName={agentName}
            />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batch action bar for grouped suggestions
// ---------------------------------------------------------------------------

function SuggestionGroupActions({
  count,
  onAcceptAll,
  onDismissAll,
}: {
  count: number;
  onAcceptAll: () => void;
  onDismissAll: () => void;
}) {
  return (
    <div className="ml-9 mb-2 flex items-center gap-2">
      <span className="text-xs text-text-muted">{count} Vorschläge</span>
      <button
        onClick={onAcceptAll}
        className="inline-flex items-center gap-1 rounded-lg bg-blueprint-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blueprint-600"
      >
        <Icon name="done_all" size={14} />
        Alle übernehmen
      </button>
      <button
        onClick={onDismissAll}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-paper-100"
      >
        <Icon name="close" size={14} />
        Alle verwerfen
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Renderer
// ---------------------------------------------------------------------------

function ChatMessageRenderer({
  message,
  onAcceptSuggestion,
  onDismissSuggestion,
  onItemClick,
  agentName,
}: {
  message: ChatMessage;
  onAcceptSuggestion?: (messageId: string) => void;
  onDismissSuggestion?: (messageId: string) => void;
  onItemClick?: (canonicalId: string) => void;
  agentName: string;
}) {
  switch (message.kind) {
    case "text":
      return message.role === "user" ? (
        <UserMessageBubble content={message.content} />
      ) : (
        <CopilotMessageBubble content={message.content} />
      );

    case "thinking":
      return <CopilotThinkingIndicator agentName={agentName} />;

    case "suggestion":
      return (
        <CopilotSuggestionCard
          suggestion={message.suggestion}
          status={message.status}
          onAccept={() => onAcceptSuggestion?.(message.id)}
          onDismiss={() => onDismissSuggestion?.(message.id)}
        />
      );

    case "confirmation":
      return (
        <CopilotConfirmation
          content={message.content}
          createdItems={message.createdItems}
          onItemClick={onItemClick}
        />
      );

    case "error":
      return (
        <div className="flex items-start gap-2">
          <div className="ml-9 max-w-[80%] rounded-2xl rounded-bl-md bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {message.content}
          </div>
        </div>
      );
  }
}
