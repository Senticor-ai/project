import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { InboxList } from "./InboxList";
import type { InboxItem, TriageResult } from "@/model/gtd-types";
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

const sampleItems: InboxItem[] = [
  createInboxItem({
    title: "Anruf bei Frau Müller wegen Fahrkostenantrag",
    captureSource: { kind: "meeting", title: "Teamrunde" },
  }),
  createInboxItem({
    title: "Design system tokens finalisieren",
    captureSource: { kind: "thought" },
  }),
  createInboxItem({
    title: "E-Mail von HR bezüglich Schulung beantworten",
    captureSource: {
      kind: "email",
      subject: "Pflichtschulung Q1",
      from: "hr@example.de",
    },
  }),
  createInboxItem({
    title: "Rechnung für Büromaterial prüfen",
  }),
];

const meta = {
  title: "GTD/InboxList",
  component: InboxList,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InboxList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithItems: Story = {
  args: {
    items: sampleItems,
    onCapture: fn(),
    onTriage: fn(),
    projects: sampleProjects,
  },
};

/** Single item — verifies singular "1 item" text and first-item triage. */
export const SingleItem: Story = {
  args: {
    items: [sampleItems[0]!],
    onCapture: fn(),
    onTriage: fn(),
    projects: sampleProjects,
  },
};

export const Empty: Story = {
  args: {
    items: [],
    onCapture: fn(),
    onTriage: fn(),
  },
};

export const Interactive: Story = {
  args: {
    items: sampleItems,
    onCapture: fn(),
    onTriage: fn(),
  },
  render: function InteractiveInbox() {
    const [items, setItems] = useState<InboxItem[]>(sampleItems);
    const [triaged, setTriaged] = useState<
      Array<{ title: string; result: TriageResult }>
    >([]);

    return (
      <div className="space-y-4">
        <InboxList
          items={items}
          projects={sampleProjects}
          onCapture={(text) => {
            setItems((prev) => [...prev, createInboxItem({ title: text })]);
          }}
          onTriage={(item, result) => {
            setItems((prev) => prev.filter((i) => i.id !== item.id));
            setTriaged((prev) => [...prev, { title: item.title, result }]);
          }}
        />
        {triaged.length > 0 && (
          <div className="rounded-md border border-border bg-paper-50 p-3">
            <p className="mb-2 text-xs font-medium text-text-muted">
              Triaged items:
            </p>
            {triaged.map((t, i) => (
              <p key={i} className="text-xs text-text-subtle">
                {t.title} → {t.result.targetBucket}
                {t.result.projectId && ` (project: ${t.result.projectId})`}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Capture a new item via the input", async () => {
      const input = canvas.getByLabelText("Capture inbox item");
      await userEvent.type(input, "Neue Aufgabe für das Team{Enter}");
      await expect(
        canvas.getByText("Neue Aufgabe für das Team"),
      ).toBeInTheDocument();
    });

    await step("Verify 5 items to process (was 4, now 5)", async () => {
      await expect(canvas.getByText("5 items to process")).toBeInTheDocument();
    });

    await step("Expand the first item to reveal triage actions", async () => {
      await userEvent.click(
        canvas.getByText("Anruf bei Frau Müller wegen Fahrkostenantrag"),
      );
      await expect(canvas.getByLabelText("Move to Next")).toBeInTheDocument();
    });

    await step("Triage the first item by clicking Move to Next", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Next"));
    });

    await step(
      "Verify 4 items to process and triaged panel shows the item",
      async () => {
        await expect(
          canvas.getByText("4 items to process"),
        ).toBeInTheDocument();
        await expect(canvas.getByText("Triaged items:")).toBeInTheDocument();
        await expect(canvas.getByText(/→ next/)).toBeInTheDocument();
      },
    );
  },
};
