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

export const Default: Story = {
  args: {
    title: "Buy groceries",
    isEditing: false,
    onSave: fn(),
    onToggleEdit: fn(),
    completed: false,
  },
};

export const Editing: Story = {
  args: {
    title: "Buy groceries",
    isEditing: true,
    onSave: fn(),
    onToggleEdit: fn(),
  },
};

export const Completed: Story = {
  args: {
    title: "Buy groceries",
    isEditing: false,
    onSave: fn(),
    onToggleEdit: fn(),
    completed: true,
  },
};

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

export const ClickToEdit: Story = {
  args: {
    title: "Buy groceries",
    isEditing: false,
    onSave: fn(),
    onToggleEdit: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    const inlineArgs = args as {
      onToggleEdit: ReturnType<typeof fn>;
    };
    const button = canvas.getByRole("button", { name: "Buy groceries" });
    await userEvent.click(button);
    expect(inlineArgs.onToggleEdit).toHaveBeenCalled();
  },
};

export const EditAndSave: Story = {
  args: {
    title: "Buy groceries",
    isEditing: true,
    onSave: fn(),
    onToggleEdit: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    const inlineArgs = args as {
      onSave: ReturnType<typeof fn>;
      onToggleEdit: ReturnType<typeof fn>;
    };
    const textarea = canvas.getByLabelText(/Edit title/);
    expect(textarea).toHaveValue("Buy groceries");

    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Buy organic groceries{Enter}");

    expect(inlineArgs.onSave).toHaveBeenCalledWith("Buy organic groceries");
    expect(inlineArgs.onToggleEdit).toHaveBeenCalled();
  },
};

export const EscapeCancels: Story = {
  args: {
    title: "Buy groceries",
    isEditing: true,
    onSave: fn(),
    onToggleEdit: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    const inlineArgs = args as {
      onSave: ReturnType<typeof fn>;
      onToggleEdit: ReturnType<typeof fn>;
    };
    const textarea = canvas.getByLabelText(/Edit title/);
    await userEvent.type(textarea, " extra text");
    await userEvent.keyboard("{Escape}");

    expect(inlineArgs.onSave).not.toHaveBeenCalled();
    expect(inlineArgs.onToggleEdit).toHaveBeenCalled();
  },
};

// ---------------------------------------------------------------------------
// Mobile viewport — touch edit affordance
// ---------------------------------------------------------------------------

export const MobileTouchEdit: Story = {
  globals: { viewport: { value: "iphone14", isRotated: false } },
  args: {
    title: "Buy groceries",
    isEditing: false,
    onSave: fn(),
    onToggleEdit: fn(),
    completed: false,
  },
  play: async ({ canvas, args }) => {
    const inlineArgs = args as { onToggleEdit: ReturnType<typeof fn> };
    // Edit icon button should be visible on mobile viewport
    const editIcon = canvas.getByLabelText(/Edit title: Buy groceries/);
    expect(editIcon).toBeVisible();
    // Verify the title text is also visible
    const title = canvas.getByRole("button", { name: "Buy groceries" });
    expect(title).toBeVisible();
    // Clicking the edit icon triggers onToggleEdit
    await editIcon.click();
    expect(inlineArgs.onToggleEdit).toHaveBeenCalled();
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
    const splitArgs = args as unknown as {
      onRename?: (newName: string) => void;
    };
    const input = canvas.getByLabelText("Title (optional)");
    await userEvent.clear(input);
    await userEvent.type(input, "Neue Bezeichnung{Enter}");
    expect(splitArgs.onRename).toHaveBeenCalledWith("Neue Bezeichnung");
  },
};
