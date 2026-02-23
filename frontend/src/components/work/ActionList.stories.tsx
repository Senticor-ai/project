import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import { ActionList } from "./ActionList";
import type { ActionItem } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";
import { createActionItem, resetFactoryCounter } from "@/model/factories";
import { store, createItemRecord } from "@/test/msw/fixtures";

resetFactoryCounter();

const sampleItems: ActionItem[] = [
  createActionItem({
    rawCapture: "Call client about Q1 proposal",
    bucket: "next",
    isFocused: true,
    dueDate: "2026-02-14",
  }),
  createActionItem({
    rawCapture: "Review team performance reports",
    bucket: "next",
    description: "Include Q4 metrics",
  }),
  createActionItem({
    rawCapture: "Submit expense report",
    bucket: "next",
    dueDate: "2026-01-15",
  }),
  createActionItem({
    rawCapture: "Plan team offsite agenda",
    bucket: "someday",
    isFocused: true,
  }),
  createActionItem({
    rawCapture: "Research new CRM tools",
    bucket: "waiting",
  }),
  createActionItem({
    rawCapture: "Anruf bei Frau Müller",
    bucket: "inbox",
  }),
  createActionItem({
    rawCapture: "Steuererklärung prüfen",
    bucket: "inbox",
  }),
];

const meta = {
  title: "Work/ActionList",
  component: ActionList,
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
} satisfies Meta<typeof ActionList>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Render-only stories
// ---------------------------------------------------------------------------

export const InboxView: Story = {
  args: {
    bucket: "inbox",
    items: sampleItems,
  },
};

export const NextActions: Story = {
  args: {
    bucket: "next",
    items: sampleItems,
  },
};

export const FocusView: Story = {
  args: {
    bucket: "focus",
    items: sampleItems,
  },
};

export const WaitingView: Story = {
  args: {
    bucket: "waiting",
    items: sampleItems,
  },
};

export const CalendarView: Story = {
  args: {
    bucket: "calendar",
    items: [
      createActionItem({
        rawCapture: "Steuererklärung abgeben",
        bucket: "calendar",
        dueDate: "2026-03-15",
        scheduledDate: "2026-03-10",
      }),
      createActionItem({
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
    items: sampleItems,
  },
};

export const Empty: Story = {
  args: {
    bucket: "next",
    items: [],
  },
};

export const EmptyInbox: Story = {
  args: {
    bucket: "inbox",
    items: [],
  },
};

export const EmptyFocus: Story = {
  args: {
    bucket: "focus",
    items: [],
  },
};

export const WithContextFilters: Story = {
  args: {
    bucket: "next",
    items: [
      createActionItem({
        rawCapture: "Call boss",
        bucket: "next",
        contexts: [
          "@phone",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
      createActionItem({
        rawCapture: "Write report",
        bucket: "next",
        contexts: [
          "@computer",
        ] as unknown as import("@/model/canonical-id").CanonicalId[],
      }),
      createActionItem({
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
    items: sampleItems,
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
    items: [],
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
    items: [],
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
    items: [],
  },
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByLabelText("Capture a thought");
    await userEvent.type(
      input,
      "First line{Shift>}{Enter}{/Shift}Second line{Enter}",
    );
    const captured = (args.onAdd as ReturnType<typeof fn>).mock
      .calls[0]?.[0] as string;
    await expect(captured).toContain("First line");
    await expect(captured).toContain("Second line");
    // Input clears and shrinks back to single row after submit
    await expect(input).toHaveValue("");
  },
};

/** Click the checkbox to complete an action — it disappears from the active list. */
export const CompleteFromList: Story = {
  args: { bucket: "next", items: [] },
  render: function CompleteDemo() {
    const [items, setItems] = useState<ActionItem[]>([
      createActionItem({ rawCapture: "Task to complete", bucket: "next" }),
      createActionItem({ rawCapture: "Task to keep", bucket: "next" }),
    ]);

    return (
      <ActionList
        bucket="next"
        items={items}
        onAdd={fn()}
        onComplete={(id) => {
          // In production, completing removes from the active query results
          setItems((prev) => prev.filter((t) => t.id !== id));
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
    items: [
      createActionItem({ rawCapture: "Active task one", bucket: "next" }),
      createActionItem({ rawCapture: "Active task two", bucket: "next" }),
    ],
  },
  beforeEach: () => {
    store.seed([
      createItemRecord({
        bucket: "next",
        name: "Completed task",
        completedAt: "2026-01-15T10:00:00Z",
      }),
    ]);
    return () => store.clear();
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Active task one")).toBeInTheDocument();
    await expect(canvas.getByText("Active task two")).toBeInTheDocument();
    await expect(canvas.getByText("2 actions")).toBeInTheDocument();
    // Toggle button visible once completed items load from API
    await waitFor(() =>
      expect(canvas.getByLabelText("Expand Done")).toBeInTheDocument(),
    );
  },
};

/** Type multiple entries rapidly — input clears instantly after each Enter. */
export const RapidMultiEntry: Story = {
  args: { bucket: "next", items: [] },
  render: function RapidEntryDemo() {
    const [items, setItems] = useState<ActionItem[]>([]);

    return (
      <ActionList
        bucket="next"
        items={items}
        onAdd={(title) => {
          // Simulate 500ms API delay
          return new Promise<void>((resolve) => {
            setTimeout(() => {
              setItems((prev) => [
                ...prev,
                createActionItem({ rawCapture: title, bucket: "next" }),
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

/** Click inbox item to expand, triage it, auto-advance to next. */
export const InboxTriageFlow: Story = {
  args: { bucket: "inbox", items: [] },
  render: function TriageDemo() {
    const [items, setItems] = useState<ActionItem[]>([
      createActionItem({ rawCapture: "First inbox item", bucket: "inbox" }),
      createActionItem({ rawCapture: "Second inbox item", bucket: "inbox" }),
    ]);

    return (
      <ActionList
        bucket="inbox"
        items={items}
        onAdd={fn()}
        onComplete={fn()}
        onToggleFocus={fn()}
        onMove={(id) => {
          setItems((prev) => prev.filter((t) => t.id !== id));
        }}
        onArchive={fn()}
        onEdit={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step(
      "First inbox item is auto-expanded with triage buttons",
      async () => {
        await expect(canvas.getByLabelText("Move to Next")).toBeInTheDocument();
      },
    );

    await step("Triage to Next — auto-advances to second item", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Next"));
      // Second item auto-expands after triage
      await expect(canvas.getByLabelText("Move to Next")).toBeInTheDocument();
      await expect(canvas.getByText("1 item to process")).toBeInTheDocument();
    });
  },
};

/** Click the star to focus an action — it sorts to the top. */
export const FocusFromList: Story = {
  args: { bucket: "next", items: [] },
  render: function FocusDemo() {
    const [items, setItems] = useState<ActionItem[]>([
      createActionItem({ rawCapture: "Unfocused task", bucket: "next" }),
      createActionItem({ rawCapture: "Will be focused", bucket: "next" }),
    ]);

    return (
      <ActionList
        bucket="next"
        items={items}
        onAdd={fn()}
        onComplete={fn()}
        onToggleFocus={(id) => {
          setItems((prev) =>
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

// ---------------------------------------------------------------------------
// Multi-select stories (inbox only) — Explorer-style click selection
// ---------------------------------------------------------------------------

/** Click to select inbox items — batch action bar appears. */
export const MultiSelectInbox: Story = {
  args: { bucket: "inbox", items: [] },
  render: function MultiSelectDemo() {
    const [items, setItems] = useState<ActionItem[]>([
      createActionItem({
        rawCapture: "Steuerbescheid 2024.pdf",
        bucket: "inbox",
      }),
      createActionItem({
        rawCapture: "Lohnsteuerbescheinigung.pdf",
        bucket: "inbox",
      }),
      createActionItem({ rawCapture: "Kontoauszug Q4.pdf", bucket: "inbox" }),
      createActionItem({ rawCapture: "Spendenquittung.pdf", bucket: "inbox" }),
      createActionItem({
        rawCapture: "Versicherungsnachweis.pdf",
        bucket: "inbox",
      }),
    ]);

    return (
      <ActionList
        bucket="inbox"
        items={items}
        onAdd={fn()}
        onComplete={fn()}
        onToggleFocus={fn()}
        onMove={(id) => {
          setItems((prev) => prev.filter((t) => t.id !== id));
        }}
        onArchive={(id) => {
          setItems((prev) => prev.filter((t) => t.id !== id));
        }}
        onEdit={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Click first item — selects it, batch bar appears", async () => {
      await userEvent.click(canvas.getByText("Steuerbescheid 2024.pdf"));
      await expect(canvas.getByText("1 selected")).toBeInTheDocument();
    });

    await step("Cmd+Click second item — adds to selection", async () => {
      await userEvent.keyboard("{Meta>}");
      await userEvent.click(canvas.getByText("Lohnsteuerbescheinigung.pdf"));
      await userEvent.keyboard("{/Meta}");
      await expect(canvas.getByText("2 selected")).toBeInTheDocument();
      await expect(
        canvas.getByLabelText("Batch move to Next"),
      ).toBeInTheDocument();
    });
  },
};

/** Batch triage: click first, Cmd+Click rest, batch move to Next — items removed. */
export const MultiSelectBatchTriage: Story = {
  args: { bucket: "inbox", items: [] },
  render: function BatchTriageDemo() {
    const [items, setItems] = useState<ActionItem[]>([
      createActionItem({ rawCapture: "Batch item A", bucket: "inbox" }),
      createActionItem({ rawCapture: "Batch item B", bucket: "inbox" }),
      createActionItem({ rawCapture: "Batch item C", bucket: "inbox" }),
    ]);

    return (
      <ActionList
        bucket="inbox"
        items={items}
        onAdd={fn()}
        onComplete={fn()}
        onToggleFocus={fn()}
        onMove={(id) => {
          setItems((prev) => prev.filter((t) => t.id !== id));
        }}
        onArchive={(id) => {
          setItems((prev) => prev.filter((t) => t.id !== id));
        }}
        onEdit={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Click first, Cmd+Click to add the rest", async () => {
      await userEvent.click(canvas.getByText("Batch item A"));
      await userEvent.keyboard("{Meta>}");
      await userEvent.click(canvas.getByText("Batch item B"));
      await userEvent.click(canvas.getByText("Batch item C"));
      await userEvent.keyboard("{/Meta}");
      await expect(canvas.getByText("3 selected")).toBeInTheDocument();
    });

    await step("Click 'Next' in batch bar — all items triaged", async () => {
      await userEvent.click(canvas.getByLabelText("Batch move to Next"));
    });

    await step("Inbox is now empty", async () => {
      await expect(canvas.getByText("Inbox is empty")).toBeInTheDocument();
    });
  },
};

/** Select all / clear selection controls in batch bar. */
export const MultiSelectControls: Story = {
  args: { bucket: "inbox", items: [] },
  render: function SelectAllDemo() {
    const [items] = useState<ActionItem[]>([
      createActionItem({ rawCapture: "Item one", bucket: "inbox" }),
      createActionItem({ rawCapture: "Item two", bucket: "inbox" }),
      createActionItem({ rawCapture: "Item three", bucket: "inbox" }),
    ]);

    return (
      <ActionList
        bucket="inbox"
        items={items}
        onAdd={fn()}
        onComplete={fn()}
        onToggleFocus={fn()}
        onMove={fn()}
        onArchive={fn()}
        onEdit={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Click one item to show batch bar", async () => {
      await userEvent.click(canvas.getByText("Item one"));
      await expect(canvas.getByText("1 selected")).toBeInTheDocument();
    });

    await step("Click 'Select all' — all items selected", async () => {
      await userEvent.click(canvas.getByLabelText("Select all"));
      await expect(canvas.getByText("3 selected")).toBeInTheDocument();
    });

    await step("Click 'Clear' — selection cleared, bar hidden", async () => {
      await userEvent.click(canvas.getByLabelText("Clear selection"));
      await expect(canvas.queryByText("selected")).not.toBeInTheDocument();
    });
  },
};

/** Shift+Click to select a range of items. */
export const MultiSelectShiftRange: Story = {
  args: { bucket: "inbox", items: [] },
  render: function ShiftRangeDemo() {
    const [items] = useState<ActionItem[]>([
      createActionItem({ rawCapture: "Item alpha", bucket: "inbox" }),
      createActionItem({ rawCapture: "Item beta", bucket: "inbox" }),
      createActionItem({ rawCapture: "Item gamma", bucket: "inbox" }),
      createActionItem({ rawCapture: "Item delta", bucket: "inbox" }),
    ]);

    return (
      <ActionList
        bucket="inbox"
        items={items}
        onAdd={fn()}
        onComplete={fn()}
        onToggleFocus={fn()}
        onMove={fn()}
        onArchive={fn()}
        onEdit={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Click first item to anchor selection", async () => {
      await userEvent.click(canvas.getByText("Item alpha"));
      await expect(canvas.getByText("1 selected")).toBeInTheDocument();
    });

    await step("Shift+Click third item to select range", async () => {
      await userEvent.keyboard("{Shift>}");
      await userEvent.click(canvas.getByText("Item gamma"));
      await userEvent.keyboard("{/Shift}");
      await expect(canvas.getByText("3 selected")).toBeInTheDocument();
    });
  },
};

/** Project picker auto-moves selected items to "next" + project. */
export const ProjectPickerAutoMove: Story = {
  args: { bucket: "inbox", items: [] },
  render: function ProjectPickerDemo() {
    const [items, setItems] = useState<ActionItem[]>([
      createActionItem({ rawCapture: "Tax receipt A", bucket: "inbox" }),
      createActionItem({ rawCapture: "Tax receipt B", bucket: "inbox" }),
      createActionItem({ rawCapture: "Unrelated item", bucket: "inbox" }),
    ]);
    const projects = [
      { id: "proj-1" as CanonicalId, name: "Steuererklärung 2025" },
    ];

    return (
      <ActionList
        bucket="inbox"
        items={items}
        onAdd={fn()}
        onComplete={fn()}
        onToggleFocus={fn()}
        onMove={(id) => {
          setItems((prev) => prev.filter((t) => t.id !== id));
        }}
        onArchive={fn()}
        onEdit={fn()}
        projects={projects}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Click first, Cmd+Click to add second", async () => {
      await userEvent.click(canvas.getByText("Tax receipt A"));
      await userEvent.keyboard("{Meta>}");
      await userEvent.click(canvas.getByText("Tax receipt B"));
      await userEvent.keyboard("{/Meta}");
      await expect(canvas.getByText("2 selected")).toBeInTheDocument();
    });

    await step("Select project — items auto-move", async () => {
      await userEvent.selectOptions(
        canvas.getByLabelText("Move batch to project"),
        "Steuererklärung 2025",
      );
    });

    await step("Selected items disappeared, unrelated stays", async () => {
      await waitFor(() => {
        expect(canvas.queryByText("Tax receipt A")).not.toBeInTheDocument();
        expect(canvas.queryByText("Tax receipt B")).not.toBeInTheDocument();
      });
      await expect(canvas.getByText("Unrelated item")).toBeInTheDocument();
    });
  },
};
