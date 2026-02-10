import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { BucketView } from "./BucketView";
import type { ActionItem } from "@/model/types";
import {
  createActionItem,
  createProject,
  resetFactoryCounter,
} from "@/model/factories";

// ---------------------------------------------------------------------------
// Shared data
// ---------------------------------------------------------------------------

resetFactoryCounter();

const sampleProjects = [
  createProject({
    name: "Website Redesign",
    desiredOutcome: "New site live",
  }),
  createProject({
    name: "Q1 Planning",
    desiredOutcome: "Q1 goals defined",
  }),
];

const sampleItems: ActionItem[] = [
  createActionItem({
    rawCapture: "Antrag von Frau Schmidt bearbeiten",
    bucket: "inbox",
    captureSource: {
      kind: "email",
      subject: "Antrag",
      from: "schmidt@bund.de",
    },
  }),
  createActionItem({
    rawCapture: "Protokoll der Abteilungsbesprechung erstellen",
    bucket: "inbox",
    captureSource: { kind: "meeting", title: "Abteilungsbesprechung" },
  }),
  createActionItem({
    rawCapture: "Schulungsunterlagen aktualisieren",
    bucket: "inbox",
  }),
  createActionItem({
    rawCapture: "Reisekostenabrechnung einreichen",
    bucket: "next",
  }),
  createActionItem({
    rawCapture: "Rückmeldung von Abteilung B abwarten",
    bucket: "waiting",
  }),
];

// ---------------------------------------------------------------------------
// Stateful wrapper
// ---------------------------------------------------------------------------

function WorkScreenApp({ initialItems = [] }: { initialItems?: ActionItem[] }) {
  const [items, setItems] = useState<ActionItem[]>(initialItems);
  const [bucket, setBucket] = useState<string>("inbox");

  return (
    <BucketView
      activeBucket={bucket as "inbox"}
      onBucketChange={(b) => setBucket(b)}
      actionItems={items}
      projects={sampleProjects}
      onAddActionItem={(title, bucket) => {
        setItems((prev) => [
          ...prev,
          createActionItem({ rawCapture: title, bucket }),
        ]);
      }}
      onCompleteActionItem={(id) => {
        setItems((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, completedAt: new Date().toISOString() } : t,
          ),
        );
      }}
      onToggleFocus={(id) => {
        setItems((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, isFocused: !t.isFocused } : t,
          ),
        );
      }}
      onMoveActionItem={(id, bucket) => {
        setItems((prev) =>
          prev.map((t) => (t.id === id ? { ...t, bucket } : t)),
        );
      }}
      onArchiveActionItem={(id) => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }}
      onUpdateTitle={(id, newTitle) => {
        setItems((prev) =>
          prev.map((t) => (t.id === id ? { ...t, name: newTitle } : t)),
        );
      }}
      onEditActionItem={(id, fields) => {
        setItems((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...fields } : t)),
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: "Screens/WorkScreen",
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="p-4" style={{ minHeight: 600 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — full screen with inbox items and actions
// ---------------------------------------------------------------------------

export const Default: Story = {
  render: () => <WorkScreenApp initialItems={[...sampleItems]} />,
};

// ---------------------------------------------------------------------------
// CaptureTriageNavigate — end-to-end screen workflow
// ---------------------------------------------------------------------------

/** Capture an item, move it to Next, navigate to Next Actions, verify counts. */
export const CaptureTriageNavigate: Story = {
  render: () => <WorkScreenApp initialItems={[...sampleItems]} />,
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "Buckets" });
    const sidebar = within(nav);

    await step("Capture a new item via inbox capture", async () => {
      const input = canvas.getByLabelText("Capture a thought");
      await userEvent.type(input, "Neue Verfügung entwerfen{Enter}");
      await expect(
        canvas.getByText("Neue Verfügung entwerfen"),
      ).toBeInTheDocument();
      await expect(canvas.getByText("4 items to process")).toBeInTheDocument();
    });

    await step(
      "Move the first item to Next (auto-expanded in inbox)",
      async () => {
        await userEvent.click(canvas.getByLabelText("Move to Next"));
        await expect(
          canvas.getByText("3 items to process"),
        ).toBeInTheDocument();
      },
    );

    await step("Click Next Actions in BucketNav", async () => {
      await userEvent.click(sidebar.getByText("Next Actions"));
      await expect(
        canvas.getByRole("heading", { name: /Next Actions/ }),
      ).toBeInTheDocument();
      // Moved item appears in Next Actions
      await expect(
        canvas.getByText("Antrag von Frau Schmidt bearbeiten"),
      ).toBeInTheDocument();
    });

    await step("Verify inbox count badge updated in sidebar", async () => {
      // Inbox badge should show 3 (was 3 inbox + 1 captured = 4, then moved 1 = 3)
      const inboxButton = sidebar.getByText("Inbox").closest("button")!;
      await expect(within(inboxButton).getByText("3")).toBeInTheDocument();
    });
  },
};
