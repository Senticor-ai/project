import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  UserMessageBubble,
  CopilotMessageBubble,
  CopilotThinkingIndicator,
  CopilotConfirmation,
} from "./ChatBubbles";

describe("UserMessageBubble", () => {
  it("renders user message text", () => {
    render(<UserMessageBubble content="Hello Copilot" />);
    expect(screen.getByText("Hello Copilot")).toBeInTheDocument();
  });

  it("preserves newlines in message", () => {
    render(<UserMessageBubble content={"Line 1\nLine 2"} />);
    expect(screen.getByText(/Line 1/)).toBeInTheDocument();
    expect(screen.getByText(/Line 2/)).toBeInTheDocument();
  });
});

describe("CopilotMessageBubble", () => {
  it("renders copilot message text", () => {
    render(<CopilotMessageBubble content="Hallo! Wie kann ich helfen?" />);
    expect(screen.getByText("Hallo! Wie kann ich helfen?")).toBeInTheDocument();
  });

  it("renders the chat_bubble avatar", () => {
    render(<CopilotMessageBubble content="Test" />);
    expect(screen.getByText("chat_bubble")).toBeInTheDocument();
  });

  it("renders bold markdown as strong tags", () => {
    render(<CopilotMessageBubble content="Das ist **wichtig** hier" />);
    const strong = screen.getByText("wichtig");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders numbered list from markdown", () => {
    render(
      <CopilotMessageBubble
        content={"1. Erster Schritt\n2. Zweiter Schritt"}
      />,
    );
    expect(screen.getByText("Erster Schritt")).toBeInTheDocument();
    expect(screen.getByText("Zweiter Schritt")).toBeInTheDocument();
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
  });
});

describe("CopilotThinkingIndicator", () => {
  it("renders the chat_bubble avatar", () => {
    render(<CopilotThinkingIndicator />);
    expect(screen.getByText("chat_bubble")).toBeInTheDocument();
  });

  it("has a thinking aria label", () => {
    render(<CopilotThinkingIndicator />);
    expect(screen.getByLabelText("Copilot denkt nach...")).toBeInTheDocument();
  });
});

describe("CopilotConfirmation", () => {
  it("renders confirmation text", () => {
    render(
      <CopilotConfirmation content="Projekt erstellt" createdItems={[]} />,
    );
    expect(screen.getByText("Projekt erstellt")).toBeInTheDocument();
  });

  it("renders created item chips", () => {
    render(
      <CopilotConfirmation
        content="Done"
        createdItems={[
          {
            canonicalId: "urn:app:project:1" as never,
            name: "Geburtstagsfeier",
            type: "project",
          },
          {
            canonicalId: "urn:app:action:2" as never,
            name: "Gästeliste",
            type: "action",
          },
        ]}
      />,
    );
    expect(screen.getByText("Geburtstagsfeier")).toBeInTheDocument();
    expect(screen.getByText("Gästeliste")).toBeInTheDocument();
  });

  it("renders check_circle icon", () => {
    render(<CopilotConfirmation content="Done" createdItems={[]} />);
    expect(screen.getByText("check_circle")).toBeInTheDocument();
  });

  it("renders type-specific icons for items", () => {
    render(
      <CopilotConfirmation
        content="Done"
        createdItems={[
          {
            canonicalId: "urn:app:project:1" as never,
            name: "Projekt",
            type: "project",
          },
          {
            canonicalId: "urn:app:action:2" as never,
            name: "Aktion",
            type: "action",
          },
          {
            canonicalId: "urn:app:ref:3" as never,
            name: "Dokument",
            type: "reference",
          },
        ]}
      />,
    );
    expect(screen.getByText("folder")).toBeInTheDocument();
    expect(screen.getByText("task_alt")).toBeInTheDocument();
    expect(screen.getByText("description")).toBeInTheDocument();
  });
});
