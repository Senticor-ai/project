import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect } from "storybook/test";
import { TayChatPanel } from "./TayChatPanel";
import type { ChatMessage } from "@/model/chat-types";
import type { CanonicalId } from "@/model/canonical-id";

const meta = {
  title: "Chat/CopilotChatPanel",
  component: TayChatPanel,
  args: {
    isOpen: true,
    onClose: fn(),
    messages: [],
    isLoading: false,
    onSend: fn(),
    onAcceptSuggestion: fn(),
    onDismissSuggestion: fn(),
    onItemClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="relative h-[600px] w-full bg-surface">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TayChatPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  args: { isOpen: false },
};

export const Empty: Story = {};

export const WithConversation: Story = {
  args: {
    messages: [
      {
        id: "u1",
        role: "user",
        kind: "text",
        content: "Hallo Copilot!",
        timestamp: "2024-01-01T10:00:00Z",
      },
      {
        id: "t1",
        role: "tay",
        kind: "text",
        content:
          "Hallo! Ich bin Copilot, dein Assistent. Wie kann ich dir helfen?",
        timestamp: "2024-01-01T10:00:01Z",
      },
    ] satisfies ChatMessage[],
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    messages: [
      {
        id: "u1",
        role: "user",
        kind: "text",
        content: "Ich brauche Hilfe bei der Geburtstagsplanung",
        timestamp: "2024-01-01T10:00:00Z",
      },
      {
        id: "th1",
        role: "tay",
        kind: "thinking",
        timestamp: "2024-01-01T10:00:01Z",
      },
    ] satisfies ChatMessage[],
  },
};

export const WithSuggestion: Story = {
  args: {
    messages: [
      {
        id: "u1",
        role: "user",
        kind: "text",
        content: "Ich hab bald Geburtstag und muss einiges organisieren",
        timestamp: "2024-01-01T10:00:00Z",
      },
      {
        id: "t1",
        role: "tay",
        kind: "text",
        content: "Klingt nach einem Projekt! Hier ist mein Vorschlag:",
        timestamp: "2024-01-01T10:00:01Z",
      },
      {
        id: "s1",
        role: "tay",
        kind: "suggestion",
        status: "pending",
        suggestion: {
          type: "create_project_with_actions",
          project: {
            name: "Geburtstagsfeier planen",
            desiredOutcome: "Erfolgreiche Geburtstagsfeier",
          },
          actions: [
            { name: "Gästeliste erstellen", bucket: "next" },
            { name: "Einladungen versenden", bucket: "next" },
            { name: "Location buchen", bucket: "next" },
            { name: "Essen & Getränke organisieren", bucket: "next" },
            { name: "Dekoration besorgen", bucket: "next" },
          ],
          documents: [{ name: "Einladungsvorlage" }],
        },
        timestamp: "2024-01-01T10:00:02Z",
      },
    ] satisfies ChatMessage[],
  },
  play: async ({ canvas }) => {
    // Verify all parts render
    expect(canvas.getByText("Geburtstagsfeier planen")).toBeInTheDocument();
    expect(canvas.getByText("Gästeliste erstellen")).toBeInTheDocument();
    expect(
      canvas.getByRole("button", { name: "Übernehmen" }),
    ).toBeInTheDocument();
  },
};

export const BirthdayScenarioComplete: Story = {
  args: {
    messages: [
      {
        id: "u1",
        role: "user",
        kind: "text",
        content: "Ich hab bald Geburtstag und muss einiges organisieren",
        timestamp: "2024-01-01T10:00:00Z",
      },
      {
        id: "t1",
        role: "tay",
        kind: "text",
        content: "Klingt nach einem Projekt! Hier ist mein Vorschlag:",
        timestamp: "2024-01-01T10:00:01Z",
      },
      {
        id: "s1",
        role: "tay",
        kind: "suggestion",
        status: "accepted",
        suggestion: {
          type: "create_project_with_actions",
          project: {
            name: "Geburtstagsfeier planen",
            desiredOutcome: "Erfolgreiche Geburtstagsfeier",
          },
          actions: [
            { name: "Gästeliste erstellen", bucket: "next" },
            { name: "Einladungen versenden", bucket: "next" },
            { name: "Location buchen", bucket: "next" },
          ],
        },
        timestamp: "2024-01-01T10:00:02Z",
      },
      {
        id: "c1",
        role: "tay",
        kind: "confirmation",
        content: "Projekt 'Geburtstagsfeier planen' erstellt mit 3 Aktionen.",
        createdItems: [
          {
            canonicalId: "urn:app:project:1" as CanonicalId,
            name: "Geburtstagsfeier planen",
            type: "project",
          },
          {
            canonicalId: "urn:app:action:2" as CanonicalId,
            name: "Gästeliste erstellen",
            type: "action",
          },
          {
            canonicalId: "urn:app:action:3" as CanonicalId,
            name: "Einladungen versenden",
            type: "action",
          },
        ],
        timestamp: "2024-01-01T10:00:03Z",
      },
    ] satisfies ChatMessage[],
  },
  play: async ({ canvas }) => {
    expect(canvas.getByText("Übernommen")).toBeInTheDocument();
    expect(canvas.getByText(/Projekt.*erstellt/)).toBeInTheDocument();
  },
};

export const ErrorState: Story = {
  args: {
    messages: [
      {
        id: "u1",
        role: "user",
        kind: "text",
        content: "Erstelle etwas",
        timestamp: "2024-01-01T10:00:00Z",
      },
      {
        id: "e1",
        role: "tay",
        kind: "error",
        content: "Es ist ein Fehler aufgetreten. Bitte versuche es erneut.",
        timestamp: "2024-01-01T10:00:01Z",
      },
    ] satisfies ChatMessage[],
  },
};

export const MinimizeAction: Story = {
  args: {
    onClose: fn(),
  },
  play: async ({ canvas, userEvent, step, args }) => {
    await step("Panel is visible", async () => {
      expect(
        canvas.getByRole("complementary", { name: "Copilot Chat" }),
      ).toBeInTheDocument();
    });

    await step("Click minimize button", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Chat schließen" }),
      );
      expect(args.onClose).toHaveBeenCalled();
    });
  },
};
