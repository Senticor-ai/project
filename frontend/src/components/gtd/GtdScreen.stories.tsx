import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { BucketView } from "./BucketView";
import type { InboxItem, Action } from "@/model/gtd-types";
import {
  createInboxItem,
  createAction,
  createProject,
  resetFactoryCounter,
} from "@/model/factories";

// ---------------------------------------------------------------------------
// Shared data
// ---------------------------------------------------------------------------

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

const sampleInboxItems = [
  createInboxItem({
    title: "Antrag von Frau Schmidt bearbeiten",
    captureSource: {
      kind: "email",
      subject: "Antrag",
      from: "schmidt@bund.de",
    },
  }),
  createInboxItem({
    title: "Protokoll der Abteilungsbesprechung erstellen",
    captureSource: { kind: "meeting", title: "Abteilungsbesprechung" },
  }),
  createInboxItem({ title: "Schulungsunterlagen aktualisieren" }),
];

const sampleActions: Action[] = [
  createAction({ title: "Reisekostenabrechnung einreichen", bucket: "next" }),
  createAction({
    title: "Rückmeldung von Abteilung B abwarten",
    bucket: "waiting",
  }),
];

// ---------------------------------------------------------------------------
// Stateful wrapper
// ---------------------------------------------------------------------------

function GtdScreenApp({
  initialInboxItems = [],
  initialActions = [],
}: {
  initialInboxItems?: InboxItem[];
  initialActions?: Action[];
}) {
  const [inboxItems, setInboxItems] = useState<InboxItem[]>(initialInboxItems);
  const [actions, setActions] = useState<Action[]>(initialActions);

  return (
    <BucketView
      initialBucket="inbox"
      inboxItems={inboxItems}
      actions={actions}
      projects={sampleProjects}
      onCaptureInbox={(text) => {
        setInboxItems((prev) => [...prev, createInboxItem({ title: text })]);
      }}
      onTriageInbox={(item, result) => {
        setInboxItems((prev) => prev.filter((i) => i.id !== item.id));
        if (
          result.targetBucket !== "archive" &&
          result.targetBucket !== "reference"
        ) {
          setActions((prev) => [
            ...prev,
            createAction({
              title: item.title,
              bucket: result.targetBucket as Action["bucket"],
              dueDate: result.date,
            }),
          ]);
        }
      }}
      onAddAction={(title, bucket) => {
        setActions((prev) => [...prev, createAction({ title, bucket })]);
      }}
      onCompleteAction={(id) => {
        setActions((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, completedAt: new Date().toISOString() } : a,
          ),
        );
      }}
      onToggleFocus={(id) => {
        setActions((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, isFocused: !a.isFocused } : a,
          ),
        );
      }}
      onMoveAction={(id, bucket) => {
        setActions((prev) =>
          prev.map((a) => (a.id === id ? { ...a, bucket } : a)),
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: "Screens/GtdScreen",
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
  render: () => (
    <GtdScreenApp
      initialInboxItems={[...sampleInboxItems]}
      initialActions={[...sampleActions]}
    />
  ),
};

// ---------------------------------------------------------------------------
// CaptureTriageNavigate — end-to-end screen workflow
// ---------------------------------------------------------------------------

/** Capture an item, triage it, navigate to Next Actions, verify counts. */
export const CaptureTriageNavigate: Story = {
  render: () => (
    <GtdScreenApp
      initialInboxItems={[...sampleInboxItems]}
      initialActions={[...sampleActions]}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "GTD buckets" });
    const sidebar = within(nav);

    await step("Capture a new item via InboxCapture", async () => {
      const input = canvas.getByLabelText("Capture inbox item");
      await userEvent.type(input, "Neue Verfügung entwerfen{Enter}");
      await expect(
        canvas.getByText("Neue Verfügung entwerfen"),
      ).toBeInTheDocument();
      await expect(canvas.getByText("4 items to process")).toBeInTheDocument();
    });

    await step("Triage the first item to Next", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Next"));
      await expect(canvas.getByText("3 items to process")).toBeInTheDocument();
    });

    await step("Click Next Actions in BucketNav", async () => {
      await userEvent.click(sidebar.getByText("Next Actions"));
      await expect(
        canvas.getByRole("heading", { name: /Next Actions/ }),
      ).toBeInTheDocument();
      // Triaged item appears in Next Actions
      await expect(
        canvas.getByText("Antrag von Frau Schmidt bearbeiten"),
      ).toBeInTheDocument();
    });

    await step("Verify inbox count badge updated in sidebar", async () => {
      // Inbox badge should show 3 (was 3 inbox + 1 captured = 4, then triaged 1 = 3)
      const inboxButton = sidebar.getByText("Inbox").closest("button")!;
      await expect(within(inboxButton).getByText("3")).toBeInTheDocument();
    });
  },
};
