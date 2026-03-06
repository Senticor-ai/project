import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopilotChatPanel } from "./CopilotChatPanel";
import type { ChatMessage } from "@/model/chat-types";
import {
  setMobileViewport,
  restoreViewport,
} from "@/test/mobile-viewport";

describe("CopilotChatPanel", () => {
  it("renders nothing when closed", () => {
    render(
      <CopilotChatPanel
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
      screen.queryByRole("complementary", { name: "Copilot Chat" }),
    ).not.toBeInTheDocument();
  });

  it("renders panel with header when open", () => {
    render(
      <CopilotChatPanel
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
      screen.getByRole("complementary", { name: "Copilot Chat" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Copilot")).toBeInTheDocument();
  });

  it("renders close button", () => {
    render(
      <CopilotChatPanel
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
      screen.getByRole("button", { name: "Chat minimieren" }),
    ).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CopilotChatPanel
        isOpen
        onClose={onClose}
        messages={[]}
        isLoading={false}
        onSend={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Chat minimieren" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders the empty message list when no messages", () => {
    render(
      <CopilotChatPanel
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
      screen.getByText("Hallo! Ich bin Copilot. Wie kann ich helfen?"),
    ).toBeInTheDocument();
  });

  it("renders messages when provided", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        kind: "text",
        content: "Hi Copilot",
        timestamp: new Date().toISOString(),
      },
    ];
    render(
      <CopilotChatPanel
        isOpen
        onClose={vi.fn()}
        messages={messages}
        isLoading={false}
        onSend={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    expect(screen.getByText("Hi Copilot")).toBeInTheDocument();
  });

  it("renders chat input", () => {
    render(
      <CopilotChatPanel
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
      screen.getByRole("textbox", { name: "Nachricht an Copilot" }),
    ).toBeInTheDocument();
  });

  it("disables input while loading", () => {
    render(
      <CopilotChatPanel
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
      screen.getByRole("textbox", { name: "Nachricht an Copilot" }),
    ).toBeDisabled();
  });

  it("renders history toggle button", () => {
    render(
      <CopilotChatPanel
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
      screen.getByRole("button", { name: "Verlauf anzeigen" }),
    ).toBeInTheDocument();
  });

  it("shows conversation list when history button clicked", async () => {
    const user = userEvent.setup();
    render(
      <CopilotChatPanel
        isOpen
        onClose={vi.fn()}
        messages={[]}
        isLoading={false}
        onSend={vi.fn()}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Verlauf anzeigen" }));
    // Should show the conversation list empty state
    expect(screen.getByText("Keine bisherigen Gespräche")).toBeInTheDocument();
    // Input should be hidden
    expect(
      screen.queryByRole("textbox", { name: "Nachricht an Copilot" }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mobile layout — panel takes full width via CSS, verify it renders correctly
// ---------------------------------------------------------------------------

describe("CopilotChatPanel mobile layout", () => {
  afterEach(restoreViewport);

  const panelProps = {
    isOpen: true as const,
    onClose: vi.fn(),
    messages: [] as ChatMessage[],
    isLoading: false,
    onSend: vi.fn(),
    onAcceptSuggestion: vi.fn(),
    onDismissSuggestion: vi.fn(),
  };

  it("renders panel with w-full class (mobile-first)", () => {
    setMobileViewport(true);
    render(<CopilotChatPanel {...panelProps} />);
    const panel = screen.getByRole("complementary", { name: "Copilot Chat" });
    expect(panel.className).toContain("w-full");
  });

  it("renders panel on desktop with the same base classes", () => {
    setMobileViewport(false);
    render(<CopilotChatPanel {...panelProps} />);
    const panel = screen.getByRole("complementary", { name: "Copilot Chat" });
    expect(panel).toBeInTheDocument();
    // md:w-[400px] is CSS-only; both viewports get the same DOM
    expect(panel.className).toContain("w-full");
  });
});
