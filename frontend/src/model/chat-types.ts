import type { CanonicalId } from "./canonical-id";
import type { ActionItemBucket } from "./types";

// ---------------------------------------------------------------------------
// Chat Message Base
// ---------------------------------------------------------------------------

export type ChatRole = "user" | "copilot";

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
// Copilot Messages
// ---------------------------------------------------------------------------

export interface CopilotTextMessage extends ChatMessageBase {
  role: "copilot";
  kind: "text";
  content: string;
  isStreaming?: boolean;
}

export interface CopilotThinkingMessage extends ChatMessageBase {
  role: "copilot";
  kind: "thinking";
}

export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "editing";

export interface CopilotSuggestionMessage extends ChatMessageBase {
  role: "copilot";
  kind: "suggestion";
  suggestion: CopilotSuggestion;
  status: SuggestionStatus;
}

export interface CreatedItemRef {
  canonicalId: CanonicalId;
  name: string;
  type: "project" | "action" | "reference";
}

export interface CopilotConfirmationMessage extends ChatMessageBase {
  role: "copilot";
  kind: "confirmation";
  content: string;
  createdItems: CreatedItemRef[];
}

export interface CopilotErrorMessage extends ChatMessageBase {
  role: "copilot";
  kind: "error";
  content: string;
}

export type ChatMessage =
  | UserChatMessage
  | CopilotTextMessage
  | CopilotThinkingMessage
  | CopilotSuggestionMessage
  | CopilotConfirmationMessage
  | CopilotErrorMessage;

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
  projectId?: CanonicalId;
}

export interface RenderCvSuggestion {
  type: "render_cv";
  sourceItemId: CanonicalId;
  css: string;
  filename: string;
  projectId: CanonicalId;
}

export interface CopilotCliSuggestion {
  type: "copilot_cli";
  argv?: string[];
  intent?: Record<string, unknown>;
}

export type CopilotSuggestion =
  | CreateProjectWithActionsSuggestion
  | CreateActionSuggestion
  | CreateReferenceSuggestion
  | RenderCvSuggestion
  | CopilotCliSuggestion;

// ---------------------------------------------------------------------------
// Chat API Types (for MSW / backend)
// ---------------------------------------------------------------------------

export interface ChatClientContext {
  timezone: string;
  locale: string;
  localTime: string;
  currentPath?: string;
  currentUrl?: string;
  appView?: "workspace" | "settings";
  appSubView?: string;
  activeBucket?: string | null;
  visibleErrors?: string[];
  visibleWorkspaceSnapshot?: VisibleWorkspaceSnapshot;
}

export interface VisibleWorkspaceItem {
  id?: string;
  type?: string;
  bucket?: string;
  name?: string;
  focused?: boolean;
  top?: number;
}

export interface VisibleWorkspaceSnapshot {
  activeBucket: string | null;
  viewTitle?: string;
  totalVisibleItems: number;
  visibleItems: VisibleWorkspaceItem[];
  bucketNav?: Array<{
    bucket: string;
    count: number;
    active: boolean;
  }>;
}

export interface ChatCompletionRequest {
  message: string;
  conversationId: string;
  context?: ChatClientContext;
}

export interface ChatToolCall {
  name: CopilotSuggestion["type"];
  arguments: CopilotSuggestion;
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
  | {
      type: "status";
      detail: string;
      phase?: "startup" | "ready";
      elapsedSeconds?: number;
    }
  | { type: "items_changed" }
  | { type: "done"; text: string }
  | { type: "error"; detail: string };

// ---------------------------------------------------------------------------
// Conversation Management Types
// ---------------------------------------------------------------------------

export interface ConversationSummary {
  conversationId: string;
  externalId: string;
  title: string | null;
  agentBackend: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessageResponse {
  messageId: string;
  role: string;
  content: string;
  toolCalls?: Record<string, unknown>[] | null;
  createdAt: string;
}
