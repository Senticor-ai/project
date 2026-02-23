import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ConversationList } from "./ConversationList";
import type { ConversationSummary } from "@/model/chat-types";

function makeConversation(
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  const now = new Date();
  return {
    conversationId: `conv-${Math.random().toString(36).slice(2, 6)}`,
    externalId: `ext-${Math.random().toString(36).slice(2, 6)}`,
    title: null,
    agentBackend: "haystack",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

const sampleConversations: ConversationSummary[] = [
  makeConversation({
    conversationId: "c1",
    title: "Geburtstagsfeier planen",
    updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  }),
  makeConversation({
    conversationId: "c2",
    title: "Bewerbung Bundesamt für Sicherheit",
    updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  }),
  makeConversation({
    conversationId: "c3",
    title: "Steuerklärung 2025 vorbereiten",
    updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  }),
  makeConversation({
    conversationId: "c4",
    title: null,
    externalId: "conv-abc123",
    updatedAt: new Date(Date.now() - 14 * 86_400_000).toISOString(),
  }),
];

const meta = {
  title: "Chat/ConversationList",
  component: ConversationList,
  args: {
    conversations: sampleConversations,
    onSelect: fn(),
    onArchive: fn(),
    onNewConversation: fn(),
  },
  decorators: [
    (Story) => (
      <div className="h-[500px] w-[380px] border border-paper-200 bg-paper-50">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConversationList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    conversations: [],
  },
};

export const SingleConversation: Story = {
  args: {
    conversations: [sampleConversations[0]!],
  },
};
