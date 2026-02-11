import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TayChatPanel } from "./TayChatPanel";
import type { ChatMessage } from "@/model/chat-types";

describe("TayChatPanel", () => {
  it("renders nothing when closed", () => {
    render(
      <TayChatPanel
        isOpen={false}
        onClose={vi.fn()}
        messages={[]}
        isLoading={false}
        onSend={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("complementary", { name: "Tay Chat" }),
    ).not.toBeInTheDocument();
  });

  it("renders panel with header when open", () => {
    render(
      <TayChatPanel
        isOpen
        onClose={vi.fn()}
        messages={[]}
        isLoading={false}
        onSend={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("complementary", { name: "Tay Chat" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Tay")).toBeInTheDocument();
  });

  it("renders close button", () => {
    render(
      <TayChatPanel
        isOpen
        onClose={vi.fn()}
        messages={[]}
        isLoading={false}
        onSend={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Chat schließen" }),
    ).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <TayChatPanel
        isOpen
        onClose={onClose}
        messages={[]}
        isLoading={false}
        onSend={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Chat schließen" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders the empty message list when no messages", () => {
    render(
      <TayChatPanel
        isOpen
        onClose={vi.fn()}
        messages={[]}
        isLoading={false}
        onSend={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Hallo! Ich bin Tay. Wie kann ich helfen?"),
    ).toBeInTheDocument();
  });

  it("renders messages when provided", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        kind: "text",
        content: "Hi Tay",
        timestamp: new Date().toISOString(),
      },
    ];
    render(
      <TayChatPanel
        isOpen
        onClose={vi.fn()}
        messages={messages}
        isLoading={false}
        onSend={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    expect(screen.getByText("Hi Tay")).toBeInTheDocument();
  });

  it("renders chat input", () => {
    render(
      <TayChatPanel
        isOpen
        onClose={vi.fn()}
        messages={[]}
        isLoading={false}
        onSend={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: "Nachricht an Tay" }),
    ).toBeInTheDocument();
  });

  it("disables input while loading", () => {
    render(
      <TayChatPanel
        isOpen
        onClose={vi.fn()}
        messages={[]}
        isLoading
        onSend={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: "Nachricht an Tay" }),
    ).toBeDisabled();
  });
});
