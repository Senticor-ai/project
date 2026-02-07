import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { BucketView } from "./BucketView";
import type { Thing } from "@/model/types";
import {
  createThing,
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

const sampleThings: Thing[] = [
  createThing({
    rawCapture: "Antrag von Frau Schmidt bearbeiten",
    bucket: "inbox",
    captureSource: {
      kind: "email",
      subject: "Antrag",
      from: "schmidt@bund.de",
    },
  }),
  createThing({
    rawCapture: "Protokoll der Abteilungsbesprechung erstellen",
    bucket: "inbox",
    captureSource: { kind: "meeting", title: "Abteilungsbesprechung" },
  }),
  createThing({
    rawCapture: "Schulungsunterlagen aktualisieren",
    bucket: "inbox",
  }),
  createThing({
    rawCapture: "Reisekostenabrechnung einreichen",
    bucket: "next",
  }),
  createThing({
    rawCapture: "Rückmeldung von Abteilung B abwarten",
    bucket: "waiting",
  }),
];

// ---------------------------------------------------------------------------
// Stateful wrapper
// ---------------------------------------------------------------------------

function WorkScreenApp({ initialThings = [] }: { initialThings?: Thing[] }) {
  const [things, setThings] = useState<Thing[]>(initialThings);

  return (
    <BucketView
      initialBucket="inbox"
      things={things}
      projects={sampleProjects}
      onAddThing={(title, bucket) => {
        setThings((prev) => [...prev, createThing({ rawCapture: title, bucket })]);
      }}
      onCompleteThing={(id) => {
        setThings((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, completedAt: new Date().toISOString() } : t,
          ),
        );
      }}
      onToggleFocus={(id) => {
        setThings((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, isFocused: !t.isFocused } : t,
          ),
        );
      }}
      onMoveThing={(id, bucket) => {
        setThings((prev) =>
          prev.map((t) => (t.id === id ? { ...t, bucket } : t)),
        );
      }}
      onArchiveThing={(id) => {
        setThings((prev) => prev.filter((t) => t.id !== id));
      }}
      onUpdateTitle={(id, newTitle) => {
        setThings((prev) =>
          prev.map((t) => (t.id === id ? { ...t, name: newTitle } : t)),
        );
      }}
      onEditThing={(id, fields) => {
        setThings((prev) =>
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
  render: () => <WorkScreenApp initialThings={[...sampleThings]} />,
};

// ---------------------------------------------------------------------------
// CaptureTriageNavigate — end-to-end screen workflow
// ---------------------------------------------------------------------------

/** Capture an item, move it to Next, navigate to Next Actions, verify counts. */
export const CaptureTriageNavigate: Story = {
  render: () => <WorkScreenApp initialThings={[...sampleThings]} />,
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

    await step("Expand and move the first item to Next", async () => {
      await userEvent.click(
        canvas.getByLabelText("Edit Antrag von Frau Schmidt bearbeiten"),
      );
      await userEvent.click(canvas.getByLabelText("Move to Next"));
      await expect(canvas.getByText("3 items to process")).toBeInTheDocument();
    });

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
