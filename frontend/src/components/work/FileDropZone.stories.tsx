import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FileDropZone } from "./FileDropZone";

const meta = {
  title: "Work/FileDropZone",
  component: FileDropZone,
  tags: ["autodocs"],
  args: {
    onFilesDropped: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-md p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FileDropZone>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Render-only stories
// ---------------------------------------------------------------------------

export const Default: Story = {};

export const WithSizeLimit: Story = {
  args: { maxSizeMb: 10 },
};

export const WithAllowedTypes: Story = {
  args: {
    allowedTypes: ["application/pdf", "image/*"],
    maxSizeMb: 5,
  },
};

/** Drop zone wrapping existing list content. */
export const WithContent: Story = {
  render: (args) => (
    <FileDropZone {...args}>
      <div className="space-y-2 pb-2">
        <div className="rounded-[var(--radius-md)] bg-paper-100 p-2 text-sm">
          Company style guide
        </div>
        <div className="rounded-[var(--radius-md)] bg-paper-100 p-2 text-sm">
          Meeting notes
        </div>
      </div>
    </FileDropZone>
  ),
};
