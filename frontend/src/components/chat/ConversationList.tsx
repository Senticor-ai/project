import { Icon } from "@/components/ui/Icon";
import type { ConversationSummary } from "@/model/chat-types";

export interface ConversationListProps {
  conversations: ConversationSummary[];
  onSelect: (conversationId: string) => void;
  onArchive: (conversationId: string) => void;
  onNewConversation: () => void;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Gerade eben";
  if (diffMins < 60) return `Vor ${diffMins} Min.`;
  if (diffHours < 24) return `Vor ${diffHours} Std.`;
  if (diffDays < 7) return `Vor ${diffDays} Tag${diffDays === 1 ? "" : "en"}`;
  return date.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

export function ConversationList({
  conversations,
  onSelect,
  onArchive,
  onNewConversation,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col">
      {/* New conversation button */}
      <div className="border-b border-paper-200 p-3">
        <button
          onClick={onNewConversation}
          className="flex w-full items-center gap-2 rounded-lg bg-blueprint-50 px-3 py-2 text-sm font-medium text-blueprint-700 transition-colors hover:bg-blueprint-100"
        >
          <Icon name="add" size={18} />
          Neues Gespräch
        </button>
      </div>

      {/* Conversation list */}
      <div
        className="flex-1 overflow-y-auto"
        role="list"
        aria-label="Gespräche"
      >
        {conversations.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-text-muted">
            Keine bisherigen Gespräche
          </p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.conversationId}
              role="listitem"
              className="group flex items-center gap-2 border-b border-paper-100 px-4 py-3 transition-colors hover:bg-paper-100"
            >
              <button
                onClick={() => onSelect(conv.conversationId)}
                className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                aria-label={`Gespräch fortsetzen: ${conv.title ?? conv.externalId}`}
              >
                <span className="truncate text-sm font-medium">
                  {conv.title ?? conv.externalId}
                </span>
                <span className="text-xs text-text-muted">
                  {formatRelativeDate(conv.updatedAt)}
                </span>
              </button>
              <button
                onClick={() => onArchive(conv.conversationId)}
                aria-label="Gespräch archivieren"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted opacity-0 transition-all hover:bg-paper-200 hover:text-red-600 group-hover:opacity-100"
              >
                <Icon name="archive" size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
