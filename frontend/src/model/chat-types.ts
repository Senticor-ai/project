import type { CanonicalId } from "./canonical-id";
import type { ActionItemBucket } from "./types";

// ---------------------------------------------------------------------------
// Chat Message Base
// ---------------------------------------------------------------------------

export type ChatRole = "user" | "tay";

export interface ChatMessageBase {
  id: string;
  role: ChatRole;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// User Messages
// ---------------------------------------------------------------------------

export interface UserChatMessage extends ChatMessageBase {
  role: "user";
  kind: "text";
  content: string;
}

// ---------------------------------------------------------------------------
// Tay Messages
// ---------------------------------------------------------------------------

export interface TayTextMessage extends ChatMessageBase {
  role: "tay";
  kind: "text";
  content: string;
  isStreaming?: boolean;
}

export interface TayThinkingMessage extends ChatMessageBase {
  role: "tay";
  kind: "thinking";
}

export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "editing";

export interface TaySuggestionMessage extends ChatMessageBase {
  role: "tay";
  kind: "suggestion";
  suggestion: TaySuggestion;
  status: SuggestionStatus;
}

export interface CreatedItemRef {
  canonicalId: CanonicalId;
  name: string;
  type: "project" | "action" | "reference";
}

export interface TayConfirmationMessage extends ChatMessageBase {
  role: "tay";
  kind: "confirmation";
  content: string;
  createdItems: CreatedItemRef[];
}

export interface TayErrorMessage extends ChatMessageBase {
  role: "tay";
  kind: "error";
  content: string;
}

export type ChatMessage =
  | UserChatMessage
  | TayTextMessage
  | TayThinkingMessage
  | TaySuggestionMessage
  | TayConfirmationMessage
  | TayErrorMessage;

// ---------------------------------------------------------------------------
// Tool / Function Call Types (V1: 3 tools)
// ---------------------------------------------------------------------------

export interface CreateProjectWithActionsSuggestion {
  type: "create_project_with_actions";
  project: {
    name: string;
    desiredOutcome: string;
  };
  actions: Array<{
    name: string;
    bucket: ActionItemBucket;
  }>;
  documents?: Array<{
    name: string;
    description?: string;
  }>;
}

export interface CreateActionSuggestion {
  type: "create_action";
  name: string;
  bucket: ActionItemBucket;
  projectId?: CanonicalId;
}

export interface CreateReferenceSuggestion {
  type: "create_reference";
  name: string;
  description?: string;
  url?: string;
}

export type TaySuggestion =
  | CreateProjectWithActionsSuggestion
  | CreateActionSuggestion
  | CreateReferenceSuggestion;

// ---------------------------------------------------------------------------
// Chat API Types (for MSW / backend)
// ---------------------------------------------------------------------------

export interface ChatCompletionRequest {
  message: string;
  conversationId: string;
}

export interface ChatToolCall {
  name: TaySuggestion["type"];
  arguments: TaySuggestion;
}

export interface ChatCompletionResponse {
  text: string;
  toolCalls?: ChatToolCall[];
}

// ---------------------------------------------------------------------------
// Streaming Events (NDJSON from backend)
// ---------------------------------------------------------------------------

export type StreamEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_calls"; toolCalls: ChatToolCall[] }
  | {
      type: "auto_executed";
      toolCall: ChatToolCall;
      createdItems: CreatedItemRef[];
    }
  | { type: "items_changed" }
  | { type: "done"; text: string }
  | { type: "error"; detail: string };
