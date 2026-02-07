import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { InboxItem } from "./InboxItem";
import {
  createInboxItem,
  createProject,
  resetFactoryCounter,
} from "@/model/factories";

resetFactoryCounter();

const sampleProjects = [
  createProject({
    title: "Website Redesign",
    desiredOutcome: "New site live",
  }),
  createProject({
    title: "Q1 Planning",
    desiredOutcome: "Q1 goals defined",
  }),
];

const thoughtItem = createInboxItem({
  title: "Design system tokens finalisieren",
  captureSource: { kind: "thought" },
  confidence: "low",
  needsEnrichment: true,
});

const emailItem = createInboxItem({
  title: "E-Mail von HR bezüglich Schulung beantworten",
  captureSource: {
    kind: "email",
    subject: "Pflichtschulung Q1",
    from: "hr@example.de",
  },
  confidence: "medium",
  needsEnrichment: false,
});

const meetingItem = createInboxItem({
  title: "Anruf bei Frau Müller wegen Fahrkostenantrag",
  captureSource: { kind: "meeting", title: "Teamrunde" },
  confidence: "high",
  needsEnrichment: false,
});

const meta = {
  title: "GTD/InboxItem",
  component: InboxItem,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InboxItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Collapsed row — click to expand. */
export const Collapsed: Story = {
  args: {
    item: thoughtItem,
    isExpanded: false,
    onTriage: fn(),
    onToggleExpand: fn(),
    projects: sampleProjects,
  },
};

/** Expanded row — shows inline triage actions. */
export const Expanded: Story = {
  args: {
    item: thoughtItem,
    isExpanded: true,
    onTriage: fn(),
    onToggleExpand: fn(),
    projects: sampleProjects,
  },
};

/** Email source — shows "via email" subtitle. */
export const EmailSource: Story = {
  args: {
    item: emailItem,
    isExpanded: false,
    onTriage: fn(),
    onToggleExpand: fn(),
  },
};

/** Meeting source — shows "via meeting" subtitle. */
export const MeetingSource: Story = {
  args: {
    item: meetingItem,
    isExpanded: false,
    onTriage: fn(),
    onToggleExpand: fn(),
  },
};

/** Thought source — no subtitle shown. */
export const ThoughtSource: Story = {
  args: {
    item: thoughtItem,
    isExpanded: false,
    onTriage: fn(),
    onToggleExpand: fn(),
  },
};

/** Expanded — triage to "Next" bucket. */
export const TriageToNext: Story = {
  args: {
    item: thoughtItem,
    isExpanded: true,
    onTriage: fn(),
    onToggleExpand: fn(),
    projects: sampleProjects,
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByLabelText("Move to Next"));
    await expect(args.onTriage).toHaveBeenCalledWith(
      expect.objectContaining({ targetBucket: "next" }),
    );
  },
};

/** Expanded — archive action. */
export const ArchiveItem: Story = {
  args: {
    item: emailItem,
    isExpanded: true,
    onTriage: fn(),
    onToggleExpand: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByLabelText("Archive"));
    await expect(args.onTriage).toHaveBeenCalledWith(
      expect.objectContaining({ targetBucket: "archive" }),
    );
  },
};
