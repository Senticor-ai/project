import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { ConversationList } from "./ConversationList";
import { ChatApi } from "@/hooks/use-copilot-api";
import type { ChatMessage, ConversationSummary } from "@/model/chat-types";

export interface CopilotChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onAcceptSuggestion: (messageId: string) => void;
  onDismissSuggestion: (messageId: string) => void;
  onAcceptAllSuggestions?: (messageIds: string[]) => void;
  onDismissAllSuggestions?: (messageIds: string[]) => void;
  onItemClick?: (canonicalId: string) => void;
  onNewConversation?: () => void;
  onLoadConversation?: (
    conversationId: string,
    messages: ChatMessage[],
  ) => void;
  agentName?: string;
  className?: string;
}

export function CopilotChatPanel({
  isOpen,
  onClose,
  messages,
  isLoading,
  onSend,
  onAcceptSuggestion,
  onDismissSuggestion,
  onAcceptAllSuggestions,
  onDismissAllSuggestions,
  onItemClick,
  onNewConversation,
  onLoadConversation,
  agentName = "Copilot",
  className,
}: CopilotChatPanelProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  // Load conversations when history view is opened
  useEffect(() => {
    if (!showHistory || !isOpen) return;
    let cancelled = false;
    ChatApi.listConversations()
      .then((data) => {
        if (!cancelled) setConversations(data);
      })
      .catch(() => {
        // Silently fail — empty list is fine
      });
    return () => {
      cancelled = true;
    };
  }, [showHistory, isOpen]);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      if (!onLoadConversation) return;
      try {
        const msgs = await ChatApi.getConversationMessages(conversationId);
        // Convert backend messages to ChatMessage format
        const chatMessages: ChatMessage[] = msgs.map((m) => ({
          id: m.messageId,
          role: m.role === "user" ? ("user" as const) : ("copilot" as const),
          kind: "text" as const,
          content: m.content,
          timestamp: m.createdAt,
        }));
        onLoadConversation(conversationId, chatMessages);
        setShowHistory(false);
      } catch {
        // Failed to load — stay on history view
      }
    },
    [onLoadConversation],
  );

  const handleArchiveConversation = useCallback(
    async (conversationId: string) => {
      try {
        await ChatApi.archiveConversation(conversationId);
        setConversations((prev) =>
          prev.filter((c) => c.conversationId !== conversationId),
        );
      } catch {
        // Failed to archive — do nothing
      }
    },
    [],
  );

  const handleNewConversation = useCallback(() => {
    onNewConversation?.();
    setShowHistory(false);
  }, [onNewConversation]);

  if (!isOpen) return null;

  return (
    <aside
      role="complementary"
      aria-label={`${agentName} Chat`}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-paper-200 bg-paper-50 shadow-lg md:w-[400px]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-paper-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blueprint-100">
            <Icon name="chat_bubble" size={16} className="text-blueprint-600" />
          </div>
          <span className="text-sm font-semibold">{agentName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory((v) => !v)}
            aria-label={showHistory ? "Chat anzeigen" : "Verlauf anzeigen"}
            aria-pressed={showHistory}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-paper-100",
              showHistory ? "text-blueprint-600" : "text-text-muted",
            )}
          >
            <Icon name="history" size={18} />
          </button>
          <button
            onClick={onClose}
            aria-label="Chat minimieren"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper-100"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      {showHistory ? (
        <ConversationList
          conversations={conversations}
          onSelect={handleSelectConversation}
          onArchive={handleArchiveConversation}
          onNewConversation={handleNewConversation}
        />
      ) : (
        <>
          {/* Messages */}
          <ChatMessageList
            messages={messages}
            onAcceptSuggestion={onAcceptSuggestion}
            onDismissSuggestion={onDismissSuggestion}
            onAcceptAllSuggestions={onAcceptAllSuggestions}
            onDismissAllSuggestions={onDismissAllSuggestions}
            onItemClick={onItemClick}
            agentName={agentName}
            className="flex-1 p-4"
          />

          {/* Input */}
          <div className="border-t border-paper-200 p-4">
            <ChatInput
              onSend={onSend}
              disabled={isLoading}
              agentName={agentName}
            />
          </div>
        </>
      )}
    </aside>
  );
}
