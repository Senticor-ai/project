import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import type { ChatMessage } from "@/model/chat-types";

export interface TayChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onAcceptSuggestion: (messageId: string) => void;
  onDismissSuggestion: (messageId: string) => void;
  onItemClick?: (canonicalId: string) => void;
  className?: string;
}

export function TayChatPanel({
  isOpen,
  onClose,
  messages,
  isLoading,
  onSend,
  onAcceptSuggestion,
  onDismissSuggestion,
  onItemClick,
  className,
}: TayChatPanelProps) {
  if (!isOpen) return null;

  return (
    <aside
      role="complementary"
      aria-label="Tay Chat"
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
          <span className="text-sm font-semibold">Tay</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Chat schließen"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper-100"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {/* Messages */}
      <ChatMessageList
        messages={messages}
        onAcceptSuggestion={onAcceptSuggestion}
        onDismissSuggestion={onDismissSuggestion}
        onItemClick={onItemClick}
        className="flex-1 p-4"
      />

      {/* Input */}
      <div className="border-t border-paper-200 p-4">
        <ChatInput onSend={onSend} disabled={isLoading} />
      </div>
    </aside>
  );
}
