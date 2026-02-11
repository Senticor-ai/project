import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  UserMessageBubble,
  TayMessageBubble,
  TayThinkingIndicator,
  TayConfirmation,
} from "./ChatBubbles";
import type { CanonicalId } from "@/model/canonical-id";

// ---------------------------------------------------------------------------
// UserMessageBubble
// ---------------------------------------------------------------------------

const userMeta = {
  title: "Chat/UserMessageBubble",
  component: UserMessageBubble,
} satisfies Meta<typeof UserMessageBubble>;

export default userMeta;
type UserStory = StoryObj<typeof userMeta>;

export const Default: UserStory = {
  args: { content: "Ich hab bald Geburtstag und muss einiges organisieren" },
};

export const MultiLine: UserStory = {
  args: {
    content:
      "Hallo Tay!\n\nIch brauche Hilfe bei der Planung meiner Geburtstagsfeier.\nKannst du mir dabei helfen?",
  },
};

export const LongMessage: UserStory = {
  args: {
    content:
      "Das ist eine sehr lange Nachricht, die zeigt wie der Textumbruch funktioniert wenn der Benutzer viel schreibt und der Bubble maximal 80% der Breite einnimmt.",
  },
};

// ---------------------------------------------------------------------------
// TayMessageBubble (separate story file would be better, but grouped for now)
// ---------------------------------------------------------------------------

export const TayMessage: StoryObj<typeof TayMessageBubble> = {
  render: () => (
    <TayMessageBubble content="Klingt nach einem Projekt! Hier ist mein Vorschlag für die Geburtstagsfeier:" />
  ),
};

export const TayGreeting: StoryObj<typeof TayMessageBubble> = {
  render: () => (
    <TayMessageBubble content="Hallo! Ich bin Tay, dein Assistent. Wie kann ich dir helfen?" />
  ),
};

// ---------------------------------------------------------------------------
// TayThinkingIndicator
// ---------------------------------------------------------------------------

export const Thinking: StoryObj<typeof TayThinkingIndicator> = {
  render: () => <TayThinkingIndicator />,
};

// ---------------------------------------------------------------------------
// TayConfirmation
// ---------------------------------------------------------------------------

export const Confirmation: StoryObj<typeof TayConfirmation> = {
  render: () => (
    <TayConfirmation
      content="Projekt 'Geburtstagsfeier planen' erstellt mit 5 Aktionen."
      createdItems={[
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
      ]}
      onItemClick={fn()}
    />
  ),
};

export const ConfirmationNoItems: StoryObj<typeof TayConfirmation> = {
  render: () => (
    <TayConfirmation
      content="Aktion 'Milch kaufen' erstellt."
      createdItems={[]}
    />
  ),
};
