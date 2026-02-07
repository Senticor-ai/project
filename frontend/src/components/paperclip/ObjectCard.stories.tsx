import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ObjectCard } from "./ObjectCard";
import { createCanonicalId } from "@/model/canonical-id";

const meta = {
  title: "Primitives/ObjectCard",
  component: ObjectCard,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    bucket: {
      control: "select",
      options: [
        "inbox",
        "next",
        "project",
        "waiting",
        "someday",
        "calendar",
        "reference",
        "focus",
      ],
    },
    confidence: {
      control: "select",
      options: ["high", "medium", "low"],
    },
  },
} satisfies Meta<typeof ObjectCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InboxItem: Story = {
  args: {
    title: "Anruf bei Frau Müller wegen Fahrkostenantrag",
    bucket: "inbox",
    confidence: "low",
    needsEnrichment: true,
  },
};

export const NextAction: Story = {
  args: {
    title: "Wireframes für Homepage erstellen",
    subtitle: "Projekt: Website Relaunch",
    bucket: "next",
    confidence: "high",
    needsEnrichment: false,
    isFocused: true,
  },
};

export const WithAttachments: Story = {
  args: {
    title: "Deploy to staging",
    bucket: "next",
    confidence: "high",
    needsEnrichment: false,
    attachments: [
      {
        type: "depends_on",
        targetId: createCanonicalId("action", "test-1"),
        targetTitle: "Pass all tests",
        createdAt: new Date().toISOString(),
      },
      {
        type: "blocks",
        targetId: createCanonicalId("action", "test-2"),
        targetTitle: "Production release",
        createdAt: new Date().toISOString(),
      },
    ],
  },
};

export const WaitingFor: Story = {
  args: {
    title: "Feedback von Sarah zum Design",
    subtitle: "Delegiert am 03.02.2026",
    bucket: "waiting",
    confidence: "medium",
    needsEnrichment: false,
    attachments: [
      {
        type: "delegates_to",
        targetId: createCanonicalId("action", "test-3"),
        targetTitle: "Sarah M.",
        createdAt: new Date().toISOString(),
      },
    ],
  },
};

export const SomedayMaybe: Story = {
  args: {
    title: "Spanisch lernen",
    bucket: "someday",
    confidence: "low",
    needsEnrichment: true,
  },
};

export const ProjectCard: Story = {
  args: {
    title: "Website Relaunch",
    subtitle: "Neue Website live und von Stakeholdern abgenommen",
    bucket: "project",
    confidence: "high",
    needsEnrichment: false,
    isFocused: true,
  },
};

export const CalendarEntry: Story = {
  args: {
    title: "Teammeeting Q1-Review",
    subtitle: "15.03.2026, 10:00 Uhr",
    bucket: "calendar",
    confidence: "high",
    needsEnrichment: false,
  },
};

export const ReferenceCard: Story = {
  args: {
    title: "Reisekostenrichtlinie 2026",
    subtitle: "PDF, aktualisiert am 01.02.2026",
    bucket: "reference",
    confidence: "medium",
    needsEnrichment: false,
  },
};

export const InteractiveCard: Story = {
  args: {
    title: "Klickbare Karte",
    bucket: "next",
    confidence: "high",
    needsEnrichment: false,
    interactive: true,
    onSelect: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByText("Klickbare Karte"));
    await expect(args.onSelect!).toHaveBeenCalled();
  },
};

export const NonInteractive: Story = {
  args: {
    title: "Nicht-interaktive Karte",
    bucket: "inbox",
    confidence: "low",
    needsEnrichment: true,
    interactive: false,
  },
};
