import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect, within } from "storybook/test";
import { ActionRow } from "./ActionRow";
import { createActionItem } from "@/model/factories";
import type { CanonicalId } from "@/model/canonical-id";

const meta = {
  title: "Work/ActionRow",
  component: ActionRow,
  args: {
    onComplete: fn(),
    onToggleFocus: fn(),
    onMove: fn(),
    onArchive: fn(),
  },
} satisfies Meta<typeof ActionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Basic states
// ---------------------------------------------------------------------------

export const Collapsed: Story = {
  args: {
    thing: createActionItem({ rawCapture: "Buy milk", bucket: "next" }),
  },
};

export const Expanded: Story = {
  args: {
    thing: createActionItem({ rawCapture: "Buy milk", bucket: "next" }),
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
    onUpdateTitle: fn(),
  },
};

export const InboxItem: Story = {
  args: {
    thing: createActionItem({
      rawCapture: "Anruf bei Frau Müller",
      bucket: "inbox",
    }),
    showBucket: true,
  },
};

export const InboxItemExpanded: Story = {
  args: {
    thing: createActionItem({
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
    thing: createActionItem({
      rawCapture: "Wireframes erstellen",
      bucket: "next",
      isFocused: true,
    }),
  },
};

export const WithDueDate: Story = {
  args: {
    thing: createActionItem({
      rawCapture: "Steuererklärung abgeben",
      bucket: "calendar",
      dueDate: "2026-03-15",
    }),
  },
};

export const Overdue: Story = {
  args: {
    thing: createActionItem({
      rawCapture: "Überfällige Aufgabe",
      bucket: "next",
      dueDate: "2020-01-01",
    }),
  },
};

export const Completed: Story = {
  args: {
    thing: createActionItem({
      rawCapture: "Erledigtes Todo",
      bucket: "next",
      completedAt: new Date().toISOString(),
    }),
  },
};

export const WithBucketBadge: Story = {
  args: {
    thing: createActionItem({
      rawCapture: "Focused action from Next",
      bucket: "next",
      isFocused: true,
    }),
    showBucket: true,
  },
};

export const EmailSource: Story = {
  args: {
    thing: createActionItem({
      rawCapture: "Follow-up mit Kunden",
      bucket: "inbox",
      captureSource: { kind: "email", subject: "Re: Vertrag" },
    }),
  },
};

export const WithNotesExpanded: Story = {
  args: {
    thing: createActionItem({
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
    thing: createActionItem({
      rawCapture: "Call the office about insurance",
      bucket: "next",
      description: "Ask about claim #12345 and policy renewal deadline.",
    }),
  },
};

/** Collapsed row with long multi-line notes, truncated at 10 lines. */
export const WithLongNotesPreview: Story = {
  args: {
    thing: createActionItem({
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
    thing: createActionItem({
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
    thing: createActionItem({ rawCapture: "Complete me", bucket: "next" }),
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Complete Complete me"));
    await expect(args.onComplete).toHaveBeenCalledWith(args.thing.id);
  },
};

export const ToggleFocus: Story = {
  args: {
    thing: createActionItem({ rawCapture: "Focus me", bucket: "next" }),
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Focus Focus me"));
    await expect(args.onToggleFocus).toHaveBeenCalledWith(args.thing.id);
  },
};

export const MoveToSomeday: Story = {
  args: {
    thing: createActionItem({ rawCapture: "Move me", bucket: "next" }),
  },
  play: async ({ canvas, args, userEvent, step }) => {
    await step("Open move menu", async () => {
      await userEvent.click(canvas.getByLabelText("Move Move me"));
    });
    await step("Select Later", async () => {
      const menu = canvas.getByRole("menu");
      await userEvent.click(within(menu).getByText("Move to Later"));
    });
    await expect(args.onMove).toHaveBeenCalledWith(args.thing.id, "someday");
  },
};

export const TriageToNext: Story = {
  args: {
    thing: createActionItem({
      rawCapture: "Triage me",
      bucket: "inbox",
    }),
    isExpanded: true,
    onToggleExpand: fn(),
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Move to Next"));
    await expect(args.onMove).toHaveBeenCalledWith(
      args.thing.id,
      "next",
      undefined,
    );
  },
};

export const ClickNotesPreview: Story = {
  args: {
    thing: createActionItem({
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

/** Expanded row — click chevron to collapse. */
export const ExpandedCollapsible: Story = {
  args: {
    thing: createActionItem({
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
    // Click collapse chevron to collapse
    await userEvent.click(canvas.getByLabelText("Collapse Collapsible item"));
    await expect(args.onToggleExpand).toHaveBeenCalled();
  },
};

/** Click title when expanded to enter title editing mode. */
export const ExpandedTitleEditing: Story = {
  args: {
    thing: createActionItem({
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
    // Double-click title to enter editing (single click toggles expand/collapse)
    await userEvent.dblClick(canvas.getByRole("button", { name: "Rename me" }));
    // Now title is a textarea
    await expect(canvas.getByDisplayValue("Rename me")).toBeInTheDocument();
  },
};

/** Calendar triage shows inline date picker before moving. */
export const TriageCalendar: Story = {
  args: {
    thing: createActionItem({
      rawCapture: "Quarterly review",
      bucket: "inbox",
    }),
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Move to Calendar"));
    await expect(canvas.getByLabelText("Schedule date")).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// ReadAction stories — file split-on-triage produces ReadAction with objectRef
// ---------------------------------------------------------------------------

/** ReadAction — collapsed, shows "Read" subtitle with auto_stories icon. */
export const ReadAction: Story = {
  args: {
    thing: createActionItem({
      name: "Quarterly Report.pdf",
      bucket: "next",
      objectRef: "urn:app:reference:doc-1" as CanonicalId,
      captureSource: {
        kind: "file",
        fileName: "Quarterly Report.pdf",
        mimeType: "application/pdf",
      },
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Read")).toBeInTheDocument();
    await expect(canvas.getByText("Quarterly Report.pdf")).toBeInTheDocument();
  },
};

/** ReadAction — expanded, shows subtitle in context with editor. */
export const ReadActionExpanded: Story = {
  args: {
    thing: createActionItem({
      name: "BSI-TR-03183-2.pdf",
      bucket: "next",
      objectRef: "urn:app:reference:doc-2" as CanonicalId,
      captureSource: {
        kind: "file",
        fileName: "BSI-TR-03183-2.pdf",
        mimeType: "application/pdf",
      },
      description: "Technical guideline for secure email transport.",
    }),
    isExpanded: true,
    onToggleExpand: fn(),
    onEdit: fn(),
    onUpdateTitle: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Read")).toBeInTheDocument();
  },
};

/** ReadAction with clickable "Read" subtitle — navigates to reference on click. */
export const ReadActionNavigate: Story = {
  args: {
    thing: createActionItem({
      name: "BSI-TR-03183-2.pdf",
      bucket: "next",
      objectRef: "urn:app:reference:doc-nav" as CanonicalId,
      captureSource: {
        kind: "file",
        fileName: "BSI-TR-03183-2.pdf",
        mimeType: "application/pdf",
      },
    }),
    onNavigateToReference: fn(),
  },
  play: async ({ canvas, args, userEvent }) => {
    const readBtn = canvas.getByLabelText("Go to reference");
    await expect(readBtn).toBeInTheDocument();
    await userEvent.click(readBtn);
    await expect(args.onNavigateToReference).toHaveBeenCalledWith(
      "urn:app:reference:doc-nav",
    );
  },
};

/** ReadAction in focus view with bucket badge. */
export const ReadActionFocused: Story = {
  args: {
    thing: createActionItem({
      name: "Amtsblatt-2026.pdf",
      bucket: "next",
      isFocused: true,
      objectRef: "urn:app:reference:doc-3" as CanonicalId,
      captureSource: {
        kind: "file",
        fileName: "Amtsblatt-2026.pdf",
        mimeType: "application/pdf",
      },
    }),
    showBucket: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Read")).toBeInTheDocument();
  },
};

export const ArchiveFromMenu: Story = {
  args: {
    thing: createActionItem({ rawCapture: "Archive me", bucket: "next" }),
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

/** Shows project badge chip when item is assigned to a project. */
export const WithProjectBadge: Story = {
  args: {
    thing: createActionItem({
      name: "Review tax documents",
      bucket: "next",
      projectId: "urn:app:project:tax-2024" as CanonicalId,
    }),
    projects: [
      {
        id: "urn:app:project:tax-2024" as CanonicalId,
        name: "Steuererklärung 2024",
      },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Steuererklärung 2024")).toBeInTheDocument();
  },
};

/** Action with tags shown as amber chips. */
export const WithTags: Story = {
  args: {
    thing: createActionItem({
      name: "Review 1099-INT",
      bucket: "next",
      tags: ["1099-int", "schedule-b"],
    }),
  },
};

// ---------------------------------------------------------------------------
// Multi-select stories
// ---------------------------------------------------------------------------

/** Move item to a different project via the overflow menu. */
export const MoveToProject: Story = {
  args: {
    thing: createActionItem({
      rawCapture: "Wrong project task",
      bucket: "next",
    }),
    onEdit: fn(),
    projects: [
      { id: "urn:app:project:p1" as CanonicalId, name: "Website Redesign" },
      { id: "urn:app:project:p2" as CanonicalId, name: "Mobile App" },
    ],
  },
  play: async ({ canvas, args, userEvent, step }) => {
    await step("Open overflow menu", async () => {
      await userEvent.click(canvas.getByLabelText("Move Wrong project task"));
    });

    const menu = canvas.getByRole("menu");

    await step("Verify project options are shown", async () => {
      await expect(
        within(menu).getByText("Website Redesign"),
      ).toBeInTheDocument();
      await expect(within(menu).getByText("Mobile App")).toBeInTheDocument();
    });

    await step("Click project to reassign", async () => {
      await userEvent.click(within(menu).getByText("Mobile App"));
    });

    await expect(args.onEdit).toHaveBeenCalledWith(args.thing.id, {
      projectId: "urn:app:project:p2",
    });
  },
};

/** Inbox item with selection highlight (Cmd/Ctrl+Click selection). */
export const SelectedHighlight: Story = {
  args: {
    thing: createActionItem({
      rawCapture: "Steuerbescheid 2024.pdf",
      bucket: "inbox",
    }),
    isSelected: true,
  },
  play: async ({ canvas }) => {
    // Row should have highlight styling (bg-blueprint-50 ring-1 ring-blueprint-200)
    const row = canvas
      .getByText("Steuerbescheid 2024.pdf")
      .closest(".bg-blueprint-50");
    await expect(row).not.toBeNull();
  },
};
