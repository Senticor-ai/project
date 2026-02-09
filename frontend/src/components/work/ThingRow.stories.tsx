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

/** Collapsed row with short notes visible below the title. */
export const WithNotesPreview: Story = {
  args: {
    thing: createThing({
      rawCapture: "Call the office about insurance",
      bucket: "next",
      description: "Ask about claim #12345 and policy renewal deadline.",
    }),
  },
};

/** Collapsed row with long multi-line notes, truncated at 10 lines. */
export const WithLongNotesPreview: Story = {
  args: {
    thing: createThing({
      rawCapture: "Project planning notes",
      bucket: "next",
      description: [
        "1. Review current sprint backlog",
        "2. Identify blockers for team",
        "3. Schedule stakeholder meeting",
        "4. Update project timeline",
        "5. Assign new tasks to developers",
        "6. Review pull requests",
        "7. Update documentation",
        "8. Prepare demo for Friday",
        "9. Check CI/CD pipeline status",
        "10. Review code coverage reports",
        "11. Plan next sprint goals",
        "12. Update risk register",
      ].join("\n"),
    }),
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

export const ClickNotesPreview: Story = {
  args: {
    thing: createThing({
      rawCapture: "Has notes",
      bucket: "next",
      description: "Important details",
    }),
    onToggleExpand: fn(),
  },
  play: async ({ canvas, args, userEvent }) => {
    // Notes preview is clickable — expands the row
    await userEvent.click(canvas.getByLabelText("Notes for Has notes"));
    await expect(args.onToggleExpand).toHaveBeenCalled();
  },
};

/** Expanded row where clicking the title collapses it (title stays a button). */
export const ExpandedCollapsible: Story = {
  args: {
    thing: createThing({
      rawCapture: "Collapsible item",
      bucket: "next",
    }),
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
    onUpdateTitle: fn(),
  },
  play: async ({ canvas, args, userEvent }) => {
    // Title is a button, not a textarea
    const titleBtn = canvas.getByRole("button", { name: "Collapsible item" });
    await expect(titleBtn).toBeInTheDocument();
    // Click title to collapse
    await userEvent.click(titleBtn);
    await expect(args.onToggleExpand).toHaveBeenCalled();
  },
};

/** Click pencil icon when expanded to enter title editing mode. */
export const ExpandedTitleEditing: Story = {
  args: {
    thing: createThing({
      rawCapture: "Rename me",
      bucket: "next",
    }),
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
    onUpdateTitle: fn(),
  },
  play: async ({ canvas, userEvent }) => {
    // Title starts as a button
    await expect(
      canvas.getByRole("button", { name: "Rename me" }),
    ).toBeInTheDocument();
    // Click pencil icon to enter editing
    await userEvent.click(canvas.getByLabelText("Rename Rename me"));
    // Now title is a textarea
    await expect(canvas.getByDisplayValue("Rename me")).toBeInTheDocument();
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
