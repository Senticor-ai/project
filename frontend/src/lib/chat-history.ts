import type {
  ChatMessage,
  ChatToolCall,
  ConversationMessageResponse,
  CopilotSuggestion,
  CopilotSuggestionMessage,
  CopilotTextMessage,
  UserChatMessage,
} from "@/model/chat-types";

const VALID_TOOL_CALL_NAMES = new Set<ChatToolCall["name"]>([
  "create_project_with_actions",
  "create_action",
  "create_reference",
  "render_cv",
  "copilot_cli",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseToolCall(raw: Record<string, unknown>): ChatToolCall | null {
  const name = raw.name;
  const argumentsValue = raw.arguments;

  if (typeof name !== "string" || !VALID_TOOL_CALL_NAMES.has(name as ChatToolCall["name"])) {
    return null;
  }
  if (!isRecord(argumentsValue)) {
    return null;
  }

  return {
    name: name as ChatToolCall["name"],
    arguments: {
      ...argumentsValue,
      type: name,
    } as unknown as CopilotSuggestion,
  };
}

export function conversationMessagesToChatMessages(
  messages: ConversationMessageResponse[],
): ChatMessage[] {
  const chatMessages: ChatMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      const userMessage: UserChatMessage = {
        id: message.messageId,
        role: "user",
        kind: "text",
        content: message.content,
        timestamp: message.createdAt,
      };
      chatMessages.push(userMessage);
      continue;
    }

    if (message.content.trim().length > 0) {
      const copilotMessage: CopilotTextMessage = {
        id: `${message.messageId}:text`,
        role: "copilot",
        kind: "text",
        content: message.content,
        timestamp: message.createdAt,
      };
      chatMessages.push(copilotMessage);
    }

    const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
    toolCalls.forEach((rawToolCall, index) => {
      if (!isRecord(rawToolCall)) {
        return;
      }

      const toolCall = parseToolCall(rawToolCall);
      if (!toolCall) {
        return;
      }

      const suggestionMessage: CopilotSuggestionMessage = {
        id: `${message.messageId}:tool:${index}`,
        role: "copilot",
        kind: "suggestion",
        suggestion: toolCall.arguments,
        status: "historical",
        timestamp: message.createdAt,
      };
      chatMessages.push(suggestionMessage);
    });
  }

  return chatMessages;
}
