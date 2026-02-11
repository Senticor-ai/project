import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/model/chat-types";
import {
  UserMessageBubble,
  TayMessageBubble,
  TayThinkingIndicator,
  TayConfirmation,
} from "./ChatBubbles";
import { TaySuggestionCard } from "./TaySuggestionCard";
import { Icon } from "@/components/ui/Icon";

export interface ChatMessageListProps {
  messages: ChatMessage[];
  onAcceptSuggestion?: (messageId: string) => void;
  onDismissSuggestion?: (messageId: string) => void;
  onItemClick?: (canonicalId: string) => void;
  className?: string;
}

export function ChatMessageList({
  messages,
  onAcceptSuggestion,
  onDismissSuggestion,
  onItemClick,
  className,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages.length]);

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
          Hallo! Ich bin Tay. Wie kann ich helfen?
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-1 flex-col gap-3 overflow-y-auto", className)}
    >
      {messages.map((msg) => (
        <ChatMessageRenderer
          key={msg.id}
          message={msg}
          onAcceptSuggestion={onAcceptSuggestion}
          onDismissSuggestion={onDismissSuggestion}
          onItemClick={onItemClick}
        />
      ))}
      <div ref={bottomRef} />
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
}: {
  message: ChatMessage;
  onAcceptSuggestion?: (messageId: string) => void;
  onDismissSuggestion?: (messageId: string) => void;
  onItemClick?: (canonicalId: string) => void;
}) {
  switch (message.kind) {
    case "text":
      return message.role === "user" ? (
        <UserMessageBubble content={message.content} />
      ) : (
        <TayMessageBubble content={message.content} />
      );

    case "thinking":
      return <TayThinkingIndicator />;

    case "suggestion":
      return (
        <TaySuggestionCard
          suggestion={message.suggestion}
          status={message.status}
          onAccept={() => onAcceptSuggestion?.(message.id)}
          onDismiss={() => onDismissSuggestion?.(message.id)}
        />
      );

    case "confirmation":
      return (
        <TayConfirmation
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
