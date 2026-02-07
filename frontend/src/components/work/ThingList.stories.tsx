import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ThingList } from "./ThingList";
import type { Thing } from "@/model/types";
import { createThing, resetFactoryCounter } from "@/model/factories";

resetFactoryCounter();

const sampleThings: Thing[] = [
  createThing({
    name: "Call client about Q1 proposal",
    bucket: "next",
    isFocused: true,
    dueDate: "2026-02-14",
  }),
  createThing({
    name: "Review team performance reports",
    bucket: "next",
    description: "Include Q4 metrics",
  }),
  createThing({
    name: "Submit expense report",
    bucket: "next",
    dueDate: "2026-01-15",
  }),
  createThing({
    name: "Plan team offsite agenda",
    bucket: "someday",
    isFocused: true,
  }),
  createThing({
    name: "Research new CRM tools",
    bucket: "waiting",
  }),
  createThing({
    name: "Anruf bei Frau Müller",
    bucket: "inbox",
    rawCapture: "Anruf bei Frau Müller",
  }),
  createThing({
    name: "Steuererklärung prüfen",
    bucket: "inbox",
    rawCapture: "Steuererklärung prüfen",
  }),
];

const meta = {
  title: "Work/ThingList",
  component: ThingList,
  tags: ["autodocs"],
  args: {
    onAdd: fn(),
    onComplete: fn(),
    onToggleFocus: fn(),
    onMove: fn(),
    onArchive: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ThingList>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Render-only stories
// ---------------------------------------------------------------------------

export const InboxView: Story = {
  args: {
    bucket: "inbox",
    things: sampleThings,
  },
};

export const NextActions: Story = {
  args: {
    bucket: "next",
    things: sampleThings,
  },
};

export const FocusView: Story = {
  args: {
    bucket: "focus",
    things: sampleThings,
  },
};

export const WaitingView: Story = {
  args: {
    bucket: "waiting",
    things: sampleThings,
  },
};

export const CalendarView: Story = {
  args: {
    bucket: "calendar",
    things: [
      createThing({
        name: "Steuererklärung abgeben",
        bucket: "calendar",
        dueDate: "2026-03-15",
        scheduledDate: "2026-03-10",
      }),
      createThing({
        name: "Team Standup",
        bucket: "calendar",
        scheduledDate: "2026-02-10",
      }),
    ],
  },
};

export const SomedayView: Story = {
  args: {
    bucket: "someday",
    things: sampleThings,
  },
};

export const Empty: Story = {
  args: {
    bucket: "next",
    things: [],
  },
};

export const EmptyInbox: Story = {
  args: {
    bucket: "inbox",
    things: [],
  },
};

export const EmptyFocus: Story = {
  args: {
    bucket: "focus",
    things: [],
  },
};

export const WithContextFilters: Story = {
  args: {
    bucket: "next",
    things: [
      createThing({
        name: "Call boss",
        bucket: "next",
        contexts: [
          "@phone",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
      createThing({
        name: "Write report",
        bucket: "next",
        contexts: [
          "@computer",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
      createThing({
        name: "Email team",
        bucket: "next",
        contexts: [
          "@phone",
          "@computer",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
    ],
  },
};

export const WithEditing: Story = {
  args: {
    bucket: "next",
    things: sampleThings,
    onEdit: fn(),
    onUpdateTitle: fn(),
  },
};

// ---------------------------------------------------------------------------
// Interactive stories with play functions
// ---------------------------------------------------------------------------

/** Type into rapid entry and press Enter to add a thing. */
export const RapidEntry: Story = {
  args: {
    bucket: "next",
    things: [],
  },
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByLabelText("Rapid entry");
    await userEvent.type(input, "Buy office supplies{Enter}");
    await expect(args.onAdd).toHaveBeenCalledWith("Buy office supplies");
  },
};

/** Type into inbox capture to add a thought. */
export const InboxCapture: Story = {
  args: {
    bucket: "inbox",
    things: [],
  },
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByLabelText("Capture a thought");
    await userEvent.type(input, "Remember to call dentist{Enter}");
    await expect(args.onAdd).toHaveBeenCalledWith("Remember to call dentist");
  },
};

/** Click the checkbox to complete an action — it disappears from the active list. */
export const CompleteFromList: Story = {
  render: function CompleteDemo() {
    const [things, setThings] = useState<Thing[]>([
      createThing({ name: "Task to complete", bucket: "next" }),
      createThing({ name: "Task to keep", bucket: "next" }),
    ]);

    return (
      <ThingList
        bucket="next"
        things={things}
        onAdd={fn()}
        onComplete={(id) => {
          setThings((prev) =>
            prev.map((t) =>
              t.id === id ? { ...t, completedAt: new Date().toISOString() } : t,
            ),
          );
        }}
        onToggleFocus={fn()}
        onMove={fn()}
        onArchive={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await expect(canvas.getByText("2 actions")).toBeInTheDocument();

    await step("Complete first action", async () => {
      await userEvent.click(canvas.getByLabelText("Complete Task to complete"));
    });

    await expect(canvas.getByText("1 action")).toBeInTheDocument();
    await expect(
      canvas.queryByText("Task to complete"),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Task to keep")).toBeInTheDocument();
  },
};

/** Toggle completed items visible/hidden. */
export const ToggleCompletedInteractive: Story = {
  render: function ToggleCompleted() {
    const [things] = useState<Thing[]>([
      createThing({ name: "Active task one", bucket: "next" }),
      createThing({ name: "Active task two", bucket: "next" }),
      createThing({
        name: "Done task one",
        bucket: "next",
        completedAt: "2026-01-20T10:00:00Z",
      }),
      createThing({
        name: "Done task two",
        bucket: "next",
        completedAt: "2026-01-18T10:00:00Z",
      }),
    ]);

    return (
      <ThingList
        bucket="next"
        things={things}
        onAdd={fn()}
        onComplete={fn()}
        onToggleFocus={fn()}
        onMove={fn()}
        onArchive={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await expect(canvas.getByText("Active task one")).toBeInTheDocument();
    await expect(canvas.getByText("Active task two")).toBeInTheDocument();
    await expect(canvas.queryByText("Done task one")).not.toBeInTheDocument();
    await expect(canvas.getByText("2 actions")).toBeInTheDocument();

    await step("Show completed", async () => {
      await userEvent.click(canvas.getByLabelText("Show completed"));
    });

    await expect(canvas.getByText("Done task one")).toBeInTheDocument();
    await expect(canvas.getByText("Done task two")).toBeInTheDocument();
    await expect(canvas.getByText("2 completed")).toBeInTheDocument();
    await expect(canvas.getByText("(+2 done)")).toBeInTheDocument();

    await step("Hide completed", async () => {
      await userEvent.click(canvas.getByLabelText("Hide completed"));
    });

    await expect(canvas.queryByText("Done task one")).not.toBeInTheDocument();
    await expect(canvas.getByText("2 actions")).toBeInTheDocument();
  },
};

/** Click the star to focus an action — it sorts to the top. */
export const FocusFromList: Story = {
  render: function FocusDemo() {
    const [things, setThings] = useState<Thing[]>([
      createThing({ name: "Unfocused task", bucket: "next" }),
      createThing({ name: "Will be focused", bucket: "next" }),
    ]);

    return (
      <ThingList
        bucket="next"
        things={things}
        onAdd={fn()}
        onComplete={fn()}
        onToggleFocus={(id) => {
          setThings((prev) =>
            prev.map((t) =>
              t.id === id ? { ...t, isFocused: !t.isFocused } : t,
            ),
          );
        }}
        onMove={fn()}
        onArchive={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Focus the second action", async () => {
      await userEvent.click(canvas.getByLabelText("Focus Will be focused"));
    });

    const focused = canvas.getByText("Will be focused");
    const unfocused = canvas.getByText("Unfocused task");
    await expect(
      focused.compareDocumentPosition(unfocused) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  },
};
