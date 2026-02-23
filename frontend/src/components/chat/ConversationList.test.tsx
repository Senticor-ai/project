import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationList } from "./ConversationList";
import type { ConversationSummary } from "@/model/chat-types";

function makeConversation(
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    conversationId: "conv-1",
    externalId: "ext-1",
    title: "Geburtstagsfeier planen",
    agentBackend: "haystack",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ConversationList", () => {
  const defaultProps = {
    conversations: [] as ConversationSummary[],
    onSelect: vi.fn(),
    onArchive: vi.fn(),
    onNewConversation: vi.fn(),
  };

  it("shows empty state when no conversations", () => {
    render(<ConversationList {...defaultProps} />);
    expect(screen.getByText("Keine bisherigen Gespräche")).toBeInTheDocument();
  });

  it("renders new conversation button", () => {
    render(<ConversationList {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /neues gespräch/i }),
    ).toBeInTheDocument();
  });

  it("calls onNewConversation when button clicked", async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    render(<ConversationList {...defaultProps} onNewConversation={onNew} />);

    await user.click(screen.getByRole("button", { name: /neues gespräch/i }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it("renders conversation titles", () => {
    const conversations = [
      makeConversation({ conversationId: "c1", title: "Feier planen" }),
      makeConversation({ conversationId: "c2", title: "Bewerbung schreiben" }),
    ];
    render(
      <ConversationList {...defaultProps} conversations={conversations} />,
    );

    expect(screen.getByText("Feier planen")).toBeInTheDocument();
    expect(screen.getByText("Bewerbung schreiben")).toBeInTheDocument();
  });

  it("falls back to externalId when title is null", () => {
    const conversations = [
      makeConversation({
        conversationId: "c1",
        title: null,
        externalId: "ext-abc",
      }),
    ];
    render(
      <ConversationList {...defaultProps} conversations={conversations} />,
    );

    expect(screen.getByText("ext-abc")).toBeInTheDocument();
  });

  it("calls onSelect when conversation clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const conversations = [
      makeConversation({ conversationId: "c1", title: "Test" }),
    ];
    render(
      <ConversationList
        {...defaultProps}
        conversations={conversations}
        onSelect={onSelect}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /gespräch fortsetzen: test/i }),
    );
    expect(onSelect).toHaveBeenCalledWith("c1");
  });

  it("calls onArchive when archive button clicked", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    const conversations = [
      makeConversation({ conversationId: "c1", title: "Test" }),
    ];
    render(
      <ConversationList
        {...defaultProps}
        conversations={conversations}
        onArchive={onArchive}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /gespräch archivieren/i }),
    );
    expect(onArchive).toHaveBeenCalledWith("c1");
  });
});
