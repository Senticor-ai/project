import type { Meta, StoryObj } from "storybook/internal/types";
import { fn, expect, within } from "storybook/test";
import { ThingRow } from "./ThingRow";
import { createThing } from "@/model/factories";

const meta = {
  title: "GTD/ThingRow",
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
    thing: createThing({ title: "Buy milk", bucket: "next" }),
  },
};

export const Expanded: Story = {
  args: {
    thing: createThing({ title: "Buy milk", bucket: "next" }),
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
    onUpdateTitle: fn(),
  },
};

export const InboxItem: Story = {
  args: {
    thing: createThing({
      title: "Anruf bei Frau Müller",
      bucket: "inbox",
      rawCapture: "Anruf bei Frau Müller",
    }),
    showBucket: true,
  },
};

export const InboxItemExpanded: Story = {
  args: {
    thing: createThing({
      title: "Anruf bei Frau Müller",
      bucket: "inbox",
      rawCapture: "Anruf bei Frau Müller",
    }),
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
  },
};

export const Focused: Story = {
  args: {
    thing: createThing({
      title: "Wireframes erstellen",
      bucket: "next",
      isFocused: true,
    }),
  },
};

export const WithDueDate: Story = {
  args: {
    thing: createThing({
      title: "Steuererklärung abgeben",
      bucket: "calendar",
      dueDate: "2026-03-15",
    }),
  },
};

export const Overdue: Story = {
  args: {
    thing: createThing({
      title: "Überfällige Aufgabe",
      bucket: "next",
      dueDate: "2020-01-01",
    }),
  },
};

export const Completed: Story = {
  args: {
    thing: createThing({
      title: "Erledigtes Todo",
      bucket: "next",
      completedAt: new Date().toISOString(),
    }),
  },
};

export const WithBucketBadge: Story = {
  args: {
    thing: createThing({
      title: "Focused action from Next",
      bucket: "next",
      isFocused: true,
    }),
    showBucket: true,
  },
};

export const EmailSource: Story = {
  args: {
    thing: createThing({
      title: "Follow-up mit Kunden",
      bucket: "inbox",
      captureSource: { kind: "email", subject: "Re: Vertrag" },
    }),
  },
};

export const WithNotesExpanded: Story = {
  args: {
    thing: createThing({
      title: "Task with notes",
      bucket: "next",
      notes: "Detailed notes about this task\nSecond line",
    }),
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
  },
};

// ---------------------------------------------------------------------------
// Interactive stories with play functions
// ---------------------------------------------------------------------------

export const CompleteAction: Story = {
  args: {
    thing: createThing({ title: "Complete me", bucket: "next" }),
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Complete Complete me"));
    await expect(args.onComplete).toHaveBeenCalledWith(args.thing.id);
  },
};

export const ToggleFocus: Story = {
  args: {
    thing: createThing({ title: "Focus me", bucket: "next" }),
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Focus Focus me"));
    await expect(args.onToggleFocus).toHaveBeenCalledWith(args.thing.id);
  },
};

export const MoveToSomeday: Story = {
  args: {
    thing: createThing({ title: "Move me", bucket: "next" }),
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
      title: "Triage me",
      bucket: "inbox",
      rawCapture: "Triage me",
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
      title: "Has notes",
      bucket: "next",
      notes: "Important details",
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
    thing: createThing({ title: "Archive me", bucket: "next" }),
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
