import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ActionRow } from "./ActionRow";
import { createAction, resetFactoryCounter } from "@/model/factories";

resetFactoryCounter();

const meta = {
  title: "GTD/ActionRow",
  component: ActionRow,
  tags: ["autodocs"],
  args: {
    onComplete: fn(),
    onToggleFocus: fn(),
    onMove: fn(),
    onSelect: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ActionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const nextAction = createAction({
  title: "Call client about Q1 proposal",
  bucket: "next",
  dueDate: "2026-02-14",
});

const focusedAction = createAction({
  title: "Review team performance reports",
  bucket: "next",
  isFocused: true,
  notes: "Include Q4 metrics and set targets for Q1.",
});

const overdueAction = createAction({
  title: "Submit expense report",
  bucket: "next",
  dueDate: "2026-01-15",
});

const completedAction = createAction({
  title: "Book flights for conference",
  bucket: "next",
  completedAt: new Date().toISOString(),
});

const somedayAction = createAction({
  title: "Learn Rust programming",
  bucket: "someday",
});

// ---------------------------------------------------------------------------
// Render-only stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { action: nextAction },
};

export const Focused: Story = {
  args: { action: focusedAction },
};

export const WithDueDate: Story = {
  args: { action: nextAction },
};

export const Overdue: Story = {
  args: { action: overdueAction },
};

export const Completed: Story = {
  args: { action: completedAction },
};

export const WithBucketBadge: Story = {
  args: { action: somedayAction, showBucket: true },
};

// ---------------------------------------------------------------------------
// Interactive stories with play functions
// ---------------------------------------------------------------------------

/** Click the checkbox to complete an action. */
export const CompleteAction: Story = {
  args: { action: nextAction },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByLabelText("Complete Call client about Q1 proposal"),
    );
    await expect(args.onComplete).toHaveBeenCalledWith(nextAction.id);
  },
};

/** Click the star to toggle focus. */
export const ToggleFocus: Story = {
  args: { action: nextAction },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByLabelText("Focus Call client about Q1 proposal"),
    );
    await expect(args.onToggleFocus).toHaveBeenCalledWith(nextAction.id);
  },
};

/** Unfocus an already-focused action. */
export const UnfocusAction: Story = {
  args: { action: focusedAction },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByLabelText("Unfocus Review team performance reports"),
    );
    await expect(args.onToggleFocus).toHaveBeenCalledWith(focusedAction.id);
  },
};

/** Open move menu and move action to Someday. */
export const MoveToSomeday: Story = {
  args: { action: nextAction },
  play: async ({ canvas, userEvent, step, args }) => {
    await step("Open move menu", async () => {
      await userEvent.click(
        canvas.getByLabelText("Move Call client about Q1 proposal"),
      );
      await expect(canvas.getByText("Move to Someday")).toBeInTheDocument();
      // Current bucket (next) should not be in menu
      await expect(
        canvas.queryByText("Move to Next"),
      ).not.toBeInTheDocument();
    });

    await step("Click Someday", async () => {
      await userEvent.click(canvas.getByText("Move to Someday"));
      await expect(args.onMove).toHaveBeenCalledWith(
        nextAction.id,
        "someday",
      );
    });
  },
};

/** Click the title to select/open an action. */
export const SelectAction: Story = {
  args: { action: nextAction },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByText("Call client about Q1 proposal"),
    );
    await expect(args.onSelect).toHaveBeenCalledWith(nextAction.id);
  },
};
