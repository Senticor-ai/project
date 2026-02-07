import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ActionList } from "./ActionList";
import type { Action } from "@/model/gtd-types";
import { createAction, resetFactoryCounter } from "@/model/factories";

resetFactoryCounter();

const sampleActions: Action[] = [
  createAction({
    title: "Call client about Q1 proposal",
    bucket: "next",
    isFocused: true,
    dueDate: "2026-02-14",
  }),
  createAction({
    title: "Review team performance reports",
    bucket: "next",
    notes: "Include Q4 metrics",
  }),
  createAction({
    title: "Submit expense report",
    bucket: "next",
    dueDate: "2026-01-15",
  }),
  createAction({
    title: "Plan team offsite agenda",
    bucket: "someday",
    isFocused: true,
  }),
  createAction({
    title: "Research new CRM tools",
    bucket: "waiting",
  }),
];

const meta = {
  title: "GTD/ActionList",
  component: ActionList,
  tags: ["autodocs"],
  args: {
    onAdd: fn(),
    onComplete: fn(),
    onToggleFocus: fn(),
    onMove: fn(),
    onSelect: fn(),
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

export const NextActions: Story = {
  args: {
    bucket: "next",
    actions: sampleActions,
  },
};

export const FocusView: Story = {
  args: {
    bucket: "focus",
    actions: sampleActions,
  },
};

export const WaitingView: Story = {
  args: {
    bucket: "waiting",
    actions: sampleActions,
  },
};

export const Empty: Story = {
  args: {
    bucket: "next",
    actions: [],
  },
};

// ---------------------------------------------------------------------------
// Interactive stories with play functions
// ---------------------------------------------------------------------------

/** Type into rapid entry and press Enter to add an action. */
export const RapidEntry: Story = {
  args: {
    bucket: "next",
    actions: [],
  },
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByLabelText("Rapid entry");
    await userEvent.type(input, "Buy office supplies{Enter}");
    await expect(args.onAdd).toHaveBeenCalledWith("Buy office supplies");
  },
};

/** Click the checkbox to complete an action — it disappears from the list. */
export const CompleteFromList: Story = {
  render: function CompleteDemo() {
    const [actions, setActions] = useState<Action[]>([
      createAction({ title: "Task to complete", bucket: "next" }),
      createAction({ title: "Task to keep", bucket: "next" }),
    ]);

    return (
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={fn()}
        onComplete={(id) => {
          setActions((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, completedAt: new Date().toISOString() } : a,
            ),
          );
        }}
        onToggleFocus={fn()}
        onMove={fn()}
        onSelect={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await expect(canvas.getByText("2 actions")).toBeInTheDocument();

    await step("Complete first action", async () => {
      await userEvent.click(
        canvas.getByLabelText("Complete Task to complete"),
      );
    });

    await expect(canvas.getByText("1 action")).toBeInTheDocument();
    await expect(
      canvas.queryByText("Task to complete"),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Task to keep")).toBeInTheDocument();
  },
};

/** Click the star to focus an action — it sorts to the top. */
export const FocusFromList: Story = {
  render: function FocusDemo() {
    const [actions, setActions] = useState<Action[]>([
      createAction({ title: "Unfocused task", bucket: "next" }),
      createAction({ title: "Will be focused", bucket: "next" }),
    ]);

    return (
      <ActionList
        bucket="next"
        actions={actions}
        onAdd={fn()}
        onComplete={fn()}
        onToggleFocus={(id) => {
          setActions((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, isFocused: !a.isFocused } : a,
            ),
          );
        }}
        onMove={fn()}
        onSelect={fn()}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Focus the second action", async () => {
      await userEvent.click(
        canvas.getByLabelText("Focus Will be focused"),
      );
    });

    // After focusing, "Will be focused" should sort to top (before "Unfocused task")
    const focused = canvas.getByText("Will be focused");
    const unfocused = canvas.getByText("Unfocused task");
    await expect(
      focused.compareDocumentPosition(unfocused) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  },
};
