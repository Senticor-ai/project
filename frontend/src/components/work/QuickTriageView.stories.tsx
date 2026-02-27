import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { QuickTriageView } from "./QuickTriageView";
import { createActionItem } from "@/model/factories";

const meta = {
  title: "Work/QuickTriageView",
  component: QuickTriageView,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100dvh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuickTriageView>;

export default meta;
type Story = StoryObj<typeof meta>;

const inboxItems = [
  createActionItem({
    name: "Buy groceries for the week",
    bucket: "inbox",
    description:
      "Get milk, eggs, bread, and vegetables from the farmer's market",
  }),
  createActionItem({
    name: "Call dentist to reschedule appointment",
    bucket: "inbox",
  }),
  createActionItem({
    name: "Read article about TypeScript 6.0 features",
    bucket: "inbox",
    description: "Bookmarked article from Hacker News about new TS features",
    tags: ["reading", "tech"],
  }),
  createActionItem({
    name: "Send invoice to client",
    bucket: "inbox",
    description: "Q1 2026 consulting invoice for Project Alpha",
  }),
  createActionItem({
    name: "Plan weekend hiking trip",
    bucket: "inbox",
    tags: ["personal", "outdoor"],
  }),
];

export const Default: Story = {
  args: {
    items: inboxItems,
    onMove: fn(),
    onArchive: fn(),
    onClose: fn(),
  },
};

export const TwoItems: Story = {
  args: {
    items: inboxItems.slice(0, 2),
    onMove: fn(),
    onArchive: fn(),
    onClose: fn(),
  },
};

export const Empty: Story = {
  args: {
    items: [],
    onMove: fn(),
    onArchive: fn(),
    onClose: fn(),
  },
};
