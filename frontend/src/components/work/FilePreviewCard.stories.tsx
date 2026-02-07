import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { FilePreviewCard } from "./FilePreviewCard";

function createMockFile(name: string, size: number, type: string): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

const meta = {
  title: "Work/FilePreviewCard",
  component: FilePreviewCard,
  tags: ["autodocs"],
  args: {
    onConfirm: fn(),
    onDiscard: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilePreviewCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Render-only stories
// ---------------------------------------------------------------------------

export const PdfFile: Story = {
  args: {
    file: createMockFile(
      "annual-report.pdf",
      2.5 * 1024 * 1024,
      "application/pdf",
    ),
  },
};

export const ImageFile: Story = {
  args: {
    file: createMockFile("screenshot.png", 450 * 1024, "image/png"),
  },
};

export const TextFile: Story = {
  args: {
    file: createMockFile("notes.txt", 1024, "text/plain"),
  },
};

export const LargeFile: Story = {
  args: {
    file: createMockFile(
      "database-backup.sql",
      85 * 1024 * 1024,
      "application/sql",
    ),
  },
};

export const TargetInbox: Story = {
  args: {
    file: createMockFile("receipt.pdf", 128 * 1024, "application/pdf"),
    targetBucket: "inbox",
  },
};

// ---------------------------------------------------------------------------
// Interactive stories with play functions
// ---------------------------------------------------------------------------

/** Edit the title and notes, then confirm. */
export const EditAndConfirm: Story = {
  args: {
    file: createMockFile("doc.pdf", 1024, "application/pdf"),
  },
  play: async ({ canvas, userEvent, args }) => {
    const titleInput = canvas.getByLabelText("Title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Custom title");

    const notesInput = canvas.getByLabelText("Notes");
    await userEvent.type(notesInput, "Important document");

    await userEvent.click(canvas.getByText("Add to Reference"));
    await expect(args.onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Custom title",
        notes: "Important document",
        targetBucket: "reference",
      }),
    );
  },
};

/** Click discard to remove the preview. */
export const DiscardFile: Story = {
  args: {
    file: createMockFile("unwanted.pdf", 1024, "application/pdf"),
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByText("Discard"));
    await expect(args.onDiscard).toHaveBeenCalled();
  },
};
