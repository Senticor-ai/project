import type { Meta, StoryObj } from "storybook/internal/types";
import { fn, expect, within } from "storybook/test";
import { ThingRow } from "./ThingRow";
import { createThing } from "@/model/factories";

const meta = {
  name: "Work/ThingRow",
  component: ThingRow,
  args: {
    onComplete: fn(),
    onToggleFocus: fn(),
    onMove: fn(),
    onArchive: fn(),
  },
} satisfies Meta<typeof ThingRow>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Basic states
// ---------------------------------------------------------------------------

export const Collapsed: Story = {
  args: {
    thing: createThing({ rawCapture: "Buy milk", bucket: "next" }),
  },
};

export const Expanded: Story = {
  args: {
    thing: createThing({ rawCapture: "Buy milk", bucket: "next" }),
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
    onUpdateTitle: fn(),
  },
};

export const InboxItem: Story = {
  args: {
    thing: createThing({
      rawCapture: "Anruf bei Frau Müller",
      bucket: "inbox",
    }),
    showBucket: true,
  },
};

export const InboxItemExpanded: Story = {
  args: {
    thing: createThing({
      rawCapture: "Anruf bei Frau Müller",
      bucket: "inbox",
    }),
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
  },
};

export const Focused: Story = {
  args: {
    thing: createThing({
      rawCapture: "Wireframes erstellen",
      bucket: "next",
      isFocused: true,
    }),
  },
};

export const WithDueDate: Story = {
  args: {
    thing: createThing({
      rawCapture: "Steuererklärung abgeben",
      bucket: "calendar",
      dueDate: "2026-03-15",
    }),
  },
};

export const Overdue: Story = {
  args: {
    thing: createThing({
      rawCapture: "Überfällige Aufgabe",
      bucket: "next",
      dueDate: "2020-01-01",
    }),
  },
};

export const Completed: Story = {
  args: {
    thing: createThing({
      rawCapture: "Erledigtes Todo",
      bucket: "next",
      completedAt: new Date().toISOString(),
    }),
  },
};

export const WithBucketBadge: Story = {
  args: {
    thing: createThing({
      rawCapture: "Focused action from Next",
      bucket: "next",
      isFocused: true,
    }),
    showBucket: true,
  },
};

export const EmailSource: Story = {
  args: {
    thing: createThing({
      rawCapture: "Follow-up mit Kunden",
      bucket: "inbox",
      captureSource: { kind: "email", subject: "Re: Vertrag" },
    }),
  },
};

export const WithNotesExpanded: Story = {
  args: {
    thing: createThing({
      rawCapture: "Task with notes",
      bucket: "next",
      description: "Detailed notes about this task\nSecond line",
    }),
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
  },
};

/** Item with an explicit name (after user rename). */
export const NamedItem: Story = {
  args: {
    thing: createThing({
      name: "Weekly Groceries",
      rawCapture: "buy bananas and stuff",
      bucket: "next",
    }),
  },
};

// ---------------------------------------------------------------------------
// Interactive stories with play functions
// ---------------------------------------------------------------------------

export const CompleteAction: Story = {
  args: {
    thing: createThing({ rawCapture: "Complete me", bucket: "next" }),
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Complete Complete me"));
    await expect(args.onComplete).toHaveBeenCalledWith(args.thing.id);
  },
};

export const ToggleFocus: Story = {
  args: {
    thing: createThing({ rawCapture: "Focus me", bucket: "next" }),
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Focus Focus me"));
    await expect(args.onToggleFocus).toHaveBeenCalledWith(args.thing.id);
  },
};

export const MoveToSomeday: Story = {
  args: {
    thing: createThing({ rawCapture: "Move me", bucket: "next" }),
  },
  play: async ({ canvas, args, userEvent, step }) => {
    await step("Open move menu", async () => {
      await userEvent.click(canvas.getByLabelText("Move Move me"));
    });
    await step("Select Someday", async () => {
      const menu = canvas.getByRole("menu");
      await userEvent.click(within(menu).getByText("Move to Someday"));
    });
    await expect(args.onMove).toHaveBeenCalledWith(args.thing.id, "someday");
  },
};

export const TriageToNext: Story = {
  args: {
    thing: createThing({
      rawCapture: "Triage me",
      bucket: "inbox",
    }),
    isExpanded: true,
    onToggleExpand: fn(),
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Move to Next"));
    await expect(args.onMove).toHaveBeenCalledWith(args.thing.id, "next");
  },
};

export const ClickNotesIcon: Story = {
  args: {
    thing: createThing({
      rawCapture: "Has notes",
      bucket: "next",
      description: "Important details",
    }),
    onToggleExpand: fn(),
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Show notes for Has notes"));
    await expect(args.onToggleExpand).toHaveBeenCalled();
  },
};

export const ArchiveFromMenu: Story = {
  args: {
    thing: createThing({ rawCapture: "Archive me", bucket: "next" }),
  },
  play: async ({ canvas, args, userEvent, step }) => {
    await step("Open menu", async () => {
      await userEvent.click(canvas.getByLabelText("Move Archive me"));
    });
    await step("Click Archive", async () => {
      const menu = canvas.getByRole("menu");
      await userEvent.click(within(menu).getByText("Archive"));
    });
    await expect(args.onArchive).toHaveBeenCalledWith(args.thing.id);
  },
};
