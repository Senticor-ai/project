import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ThingList } from "./ThingList";
import type { Thing } from "@/model/types";
import { createThing, resetFactoryCounter } from "@/model/factories";

resetFactoryCounter();

const sampleThings: Thing[] = [
  createThing({
    rawCapture: "Call client about Q1 proposal",
    bucket: "next",
    isFocused: true,
    dueDate: "2026-02-14",
  }),
  createThing({
    rawCapture: "Review team performance reports",
    bucket: "next",
    description: "Include Q4 metrics",
  }),
  createThing({
    rawCapture: "Submit expense report",
    bucket: "next",
    dueDate: "2026-01-15",
  }),
  createThing({
    rawCapture: "Plan team offsite agenda",
    bucket: "someday",
    isFocused: true,
  }),
  createThing({
    rawCapture: "Research new CRM tools",
    bucket: "waiting",
  }),
  createThing({
    rawCapture: "Anruf bei Frau Müller",
    bucket: "inbox",
  }),
  createThing({
    rawCapture: "Steuererklärung prüfen",
    bucket: "inbox",
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
        rawCapture: "Steuererklärung abgeben",
        bucket: "calendar",
        dueDate: "2026-03-15",
        scheduledDate: "2026-03-10",
      }),
      createThing({
        rawCapture: "Team Standup",
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
        rawCapture: "Call boss",
        bucket: "next",
        contexts: [
          "@phone",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
      createThing({
        rawCapture: "Write report",
        bucket: "next",
        contexts: [
          "@computer",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
      createThing({
        rawCapture: "Email team",
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

/** Shift+Enter inserts newlines; Enter submits the multiline text. */
export const MultilineEntry: Story = {
  args: {
    bucket: "inbox",
    things: [],
  },
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByLabelText("Capture a thought");
    await userEvent.type(
      input,
      "First line{Shift>}{Enter}{/Shift}Second line{Enter}",
    );
    const captured = (args.onAdd as ReturnType<typeof fn>).mock
      .calls[0][0] as string;
    await expect(captured).toContain("First line");
    await expect(captured).toContain("Second line");
    // Input clears and shrinks back to single row after submit
    await expect(input).toHaveValue("");
  },
};

/** Click the checkbox to complete an action — it disappears from the active list. */
export const CompleteFromList: Story = {
  render: function CompleteDemo() {
    const [things, setThings] = useState<Thing[]>([
      createThing({ rawCapture: "Task to complete", bucket: "next" }),
      createThing({ rawCapture: "Task to keep", bucket: "next" }),
    ]);

    return (
      <ThingList
        bucket="next"
        things={things}
        onAdd={fn()}
        onComplete={(id) => {
          // In production, completing removes from the active query results
          setThings((prev) => prev.filter((t) => t.id !== id));
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

/** Shows the completed toggle button (completed items come from the API). */
export const ToggleCompletedInteractive: Story = {
  args: {
    bucket: "next",
    things: [
      createThing({ rawCapture: "Active task one", bucket: "next" }),
      createThing({ rawCapture: "Active task two", bucket: "next" }),
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Active task one")).toBeInTheDocument();
    await expect(canvas.getByText("Active task two")).toBeInTheDocument();
    await expect(canvas.getByText("2 actions")).toBeInTheDocument();
    // Toggle button is always visible
    await expect(canvas.getByLabelText("Show completed")).toBeInTheDocument();
  },
};

/** Type multiple entries rapidly — input clears instantly after each Enter. */
export const RapidMultiEntry: Story = {
  render: function RapidEntryDemo() {
    const [things, setThings] = useState<Thing[]>([]);

    return (
      <ThingList
        bucket="next"
        things={things}
        onAdd={(title) => {
          // Simulate 500ms API delay
          return new Promise<void>((resolve) => {
            setTimeout(() => {
              setThings((prev) => [
                ...prev,
                createThing({ rawCapture: title, bucket: "next" }),
              ]);
              resolve();
            }, 500);
          });
        }}
        onComplete={fn()}
        onToggleFocus={fn()}
        onMove={fn()}
        onArchive={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    const input = canvas.getByLabelText("Rapid entry");

    await step("Type three entries rapidly", async () => {
      await userEvent.type(input, "Buy office supplies{Enter}");
      await userEvent.type(input, "Schedule meeting{Enter}");
      await userEvent.type(input, "Review PR{Enter}");
    });

    // Input is clear and ready for more
    await expect(input).toHaveValue("");
    await expect(input).not.toBeDisabled();
  },
};

/** Click the star to focus an action — it sorts to the top. */
export const FocusFromList: Story = {
  render: function FocusDemo() {
    const [things, setThings] = useState<Thing[]>([
      createThing({ rawCapture: "Unfocused task", bucket: "next" }),
      createThing({ rawCapture: "Will be focused", bucket: "next" }),
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
