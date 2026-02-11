import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChatMessageList } from "./ChatMessageList";
import type { ChatMessage } from "@/model/chat-types";
import type { CanonicalId } from "@/model/canonical-id";

const meta = {
  title: "Chat/ChatMessageList",
  component: ChatMessageList,
  args: {
    onAcceptSuggestion: fn(),
    onDismissSuggestion: fn(),
    onItemClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="h-[500px] w-[380px] rounded-lg border border-paper-200 bg-paper-50 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatMessageList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { messages: [] },
};

export const SimpleConversation: Story = {
  args: {
    messages: [
      {
        id: "u1",
        role: "user",
        kind: "text",
        content: "Hallo Tay!",
        timestamp: "2024-01-01T10:00:00Z",
      },
      {
        id: "t1",
        role: "tay",
        kind: "text",
        content: "Hallo! Ich bin Tay, dein Assistent. Wie kann ich dir helfen?",
        timestamp: "2024-01-01T10:00:01Z",
      },
      {
        id: "u2",
        role: "user",
        kind: "text",
        content: "Ich hab bald Geburtstag und muss einiges organisieren",
        timestamp: "2024-01-01T10:00:30Z",
      },
    ] satisfies ChatMessage[],
  },
};

export const WithThinking: Story = {
  args: {
    messages: [
      {
        id: "u1",
        role: "user",
        kind: "text",
        content: "Kannst du mir bei der Geburtstagsplanung helfen?",
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
};

export const ErrorState: Story = {
  args: {
    messages: [
      {
        id: "u1",
        role: "user",
        kind: "text",
        content: "Erstelle ein Projekt",
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
