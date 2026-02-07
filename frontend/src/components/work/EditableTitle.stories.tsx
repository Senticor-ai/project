import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect } from "storybook/test";
import { EditableTitle } from "./EditableTitle";

const meta = {
  title: "Work/EditableTitle",
  component: EditableTitle,
  args: {
    title: "Buy groceries",
    isEditing: false,
    onSave: fn(),
    onToggleEdit: fn(),
    completed: false,
  },
} satisfies Meta<typeof EditableTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Render states
// ---------------------------------------------------------------------------

export const Default: Story = {};

export const Editing: Story = {
  args: { isEditing: true },
};

export const Completed: Story = {
  args: { completed: true },
};

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

export const ClickToEdit: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const button = canvas.getByRole("button", { name: "Buy groceries" });
    await userEvent.click(button);
    expect(args.onToggleEdit).toHaveBeenCalled();
  },
};

export const EditAndSave: Story = {
  args: { isEditing: true },
  play: async ({ canvas, userEvent, args }) => {
    const textarea = canvas.getByLabelText(/Edit title/);
    expect(textarea).toHaveValue("Buy groceries");

    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Buy organic groceries{Enter}");

    expect(args.onSave).toHaveBeenCalledWith("Buy organic groceries");
    expect(args.onToggleEdit).toHaveBeenCalled();
  },
};

export const EscapeCancels: Story = {
  args: { isEditing: true },
  play: async ({ canvas, userEvent, args }) => {
    const textarea = canvas.getByLabelText(/Edit title/);
    await userEvent.type(textarea, " extra text");
    await userEvent.keyboard("{Escape}");

    expect(args.onSave).not.toHaveBeenCalled();
    expect(args.onToggleEdit).toHaveBeenCalled();
  },
};
