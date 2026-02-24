import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { CreatedItemRef } from "@/model/chat-types";

// ---------------------------------------------------------------------------
// User Message
// ---------------------------------------------------------------------------

export interface UserMessageBubbleProps {
  content: string;
  className?: string;
}

export function UserMessageBubble({
  content,
  className,
}: UserMessageBubbleProps) {
  return (
    <div className={cn("flex justify-end", className)}>
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-paper-100 px-4 py-2.5 text-sm whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copilot Message
// ---------------------------------------------------------------------------

export interface CopilotMessageBubbleProps {
  content: string;
  className?: string;
}

export function CopilotMessageBubble({
  content,
  className,
}: CopilotMessageBubbleProps) {
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <CopilotAvatar />
      <div className="copilot-prose max-w-[80%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm shadow-sm">
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copilot Thinking Indicator
// ---------------------------------------------------------------------------

export interface CopilotThinkingIndicatorProps {
  agentName?: string;
  className?: string;
}

export function CopilotThinkingIndicator({
  agentName = "Copilot",
  className,
}: CopilotThinkingIndicatorProps) {
  return (
    <div
      role="status"
      className={cn("flex items-start gap-2", className)}
      aria-label={`${agentName} denkt nach...`}
    >
      <CopilotAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
        <span className="h-2 w-2 animate-bounce rounded-full bg-paper-400 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-paper-400 [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-paper-400 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copilot Confirmation
// ---------------------------------------------------------------------------

const itemTypeIcon: Record<CreatedItemRef["type"], string> = {
  project: "folder",
  action: "task_alt",
  reference: "description",
};

export interface CopilotConfirmationProps {
  content: string;
  createdItems: CreatedItemRef[];
  onItemClick?: (canonicalId: string) => void;
  className?: string;
}

export function CopilotConfirmation({
  content,
  createdItems,
  onItemClick,
  className,
}: CopilotConfirmationProps) {
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <CopilotAvatar />
      <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-1.5 text-sm text-green-700">
          <Icon name="check_circle" size={16} className="text-green-600" />
          {content}
        </div>
        {createdItems.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {createdItems.map((item) => (
              <button
                key={item.canonicalId}
                onClick={() => onItemClick?.(item.canonicalId)}
                className="inline-flex items-center gap-1 rounded-full border border-paper-300 bg-paper-50 px-2.5 py-0.5 text-xs font-medium text-text-muted transition-colors hover:bg-paper-100"
              >
                <Icon name={itemTypeIcon[item.type]} size={12} />
                <span className="max-w-32 truncate">{item.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared Avatar
// ---------------------------------------------------------------------------

function CopilotAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blueprint-100 text-blueprint-600">
      <Icon name="chat_bubble" size={16} />
    </div>
  );
}
