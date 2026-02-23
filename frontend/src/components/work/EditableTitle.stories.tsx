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

// ---------------------------------------------------------------------------
// Split title mode (rename provenance epic)
// ---------------------------------------------------------------------------

export const DefaultSplit: Story = {
  args: {
    variant: "split",
    name: "Steuerunterlagen vorbereiten",
    rawCapture: "ich muss die steuerunterlagen fuer 2025 vorbereiten",
    nameProvenance: {
      setBy: "ai",
      setAt: "2026-01-15T09:00:00Z",
      source: "AI suggested from rawCapture",
    },
    onRename: fn(),
  },
};

export const RawCaptureOnly: Story = {
  args: {
    variant: "split",
    rawCapture: "e-mail an steuerberater wegen frist",
    onRename: fn(),
  },
};

export const AIRenamed: Story = {
  args: {
    variant: "split",
    name: "E-Mail an Steuerberater senden",
    rawCapture: "steuerberater schreiben",
    nameProvenance: {
      setBy: "ai",
      setAt: "2026-01-15T09:00:00Z",
      source: "AI suggested from rawCapture",
    },
    onRename: fn(),
  },
};

export const UserRenamed: Story = {
  args: {
    variant: "split",
    name: "Steuerberater wegen Umsatzsteuer kontaktieren",
    rawCapture: "steuerberater schreiben",
    nameProvenance: {
      setBy: "user",
      setAt: "2026-01-15T10:00:00Z",
      source: "user renamed in EditableTitle",
    },
    onRename: fn(),
  },
};

export const RenameViaEnter: Story = {
  args: {
    variant: "split",
    name: "Alte Bezeichnung",
    rawCapture: "urspruenglicher text",
    onRename: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByLabelText("Title (optional)");
    await userEvent.clear(input);
    await userEvent.type(input, "Neue Bezeichnung{Enter}");
    expect(args.onRename).toHaveBeenCalledWith("Neue Bezeichnung");
  },
};
