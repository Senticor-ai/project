import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMessageList } from "./ChatMessageList";
import type {
  ChatMessage,
  UserChatMessage,
  TayTextMessage,
  TayThinkingMessage,
  TayConfirmationMessage,
} from "@/model/chat-types";
import type { CanonicalId } from "@/model/canonical-id";

function userMsg(content: string, id = "u1"): UserChatMessage {
  return {
    id,
    role: "user",
    kind: "text",
    content,
    timestamp: new Date().toISOString(),
  };
}

function tayMsg(content: string, id = "t1"): TayTextMessage {
  return {
    id,
    role: "tay",
    kind: "text",
    content,
    timestamp: new Date().toISOString(),
  };
}

function thinkingMsg(id = "th1"): TayThinkingMessage {
  return {
    id,
    role: "tay",
    kind: "thinking",
    timestamp: new Date().toISOString(),
  };
}

function confirmMsg(id = "c1"): TayConfirmationMessage {
  return {
    id,
    role: "tay",
    kind: "confirmation",
    content: "Projekt erstellt",
    createdItems: [
      {
        canonicalId: "urn:app:project:1" as CanonicalId,
        name: "Test Projekt",
        type: "project",
      },
    ],
    timestamp: new Date().toISOString(),
  };
}

describe("ChatMessageList", () => {
  it("renders empty state when no messages", () => {
    render(<ChatMessageList messages={[]} />);
    expect(
      screen.getByText("Hallo! Ich bin Tay. Wie kann ich helfen?"),
    ).toBeInTheDocument();
  });

  it("renders user messages", () => {
    const messages: ChatMessage[] = [userMsg("Hello")];
    render(<ChatMessageList messages={messages} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders tay text messages with avatar", () => {
    const messages: ChatMessage[] = [tayMsg("Hallo!")];
    render(<ChatMessageList messages={messages} />);
    expect(screen.getByText("Hallo!")).toBeInTheDocument();
    expect(screen.getByText("chat_bubble")).toBeInTheDocument();
  });

  it("renders thinking indicator", () => {
    const messages: ChatMessage[] = [thinkingMsg()];
    render(<ChatMessageList messages={messages} />);
    expect(screen.getByLabelText("Tay denkt nach...")).toBeInTheDocument();
  });

  it("renders confirmation messages", () => {
    const messages: ChatMessage[] = [confirmMsg()];
    render(<ChatMessageList messages={messages} />);
    expect(screen.getByText("Projekt erstellt")).toBeInTheDocument();
    expect(screen.getByText("Test Projekt")).toBeInTheDocument();
  });

  it("renders multiple messages in order", () => {
    const messages: ChatMessage[] = [
      userMsg("Hi", "u1"),
      tayMsg("Hallo!", "t1"),
      userMsg("Was kannst du?", "u2"),
    ];
    render(<ChatMessageList messages={messages} />);
    const texts = screen.getAllByText(/.+/).map((el) => el.textContent);
    expect(texts).toContain("Hi");
    expect(texts).toContain("Hallo!");
    expect(texts).toContain("Was kannst du?");
  });

  it("renders suggestion messages with suggestion card", () => {
    const messages: ChatMessage[] = [
      {
        id: "s1",
        role: "tay",
        kind: "suggestion",
        status: "pending",
        suggestion: {
          type: "create_project_with_actions",
          project: { name: "Test", desiredOutcome: "Outcome" },
          actions: [{ name: "Aktion 1", bucket: "next" }],
        },
        timestamp: new Date().toISOString(),
      },
    ];
    render(
      <ChatMessageList
        messages={messages}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("Aktion 1")).toBeInTheDocument();
  });
});
