import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { DuplicateImportWarning } from "./DuplicateImportWarning";

const meta = {
  title: "Settings/DuplicateImportWarning",
  component: DuplicateImportWarning,
  tags: ["autodocs"],
  args: {
    previousImport: {
      job_id: "job-old",
      status: "completed",
      total: 142,
      created_at: "2025-06-10T14:30:00Z",
    },
    onContinue: fn(),
    onCancel: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DuplicateImportWarning>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — completed previous import
// ---------------------------------------------------------------------------

export const Default: Story = {};

// ---------------------------------------------------------------------------
// PreviouslyFailed — previous import had failed
// ---------------------------------------------------------------------------

export const PreviouslyFailed: Story = {
  args: {
    previousImport: {
      job_id: "job-fail",
      status: "failed",
      total: 85,
      created_at: "2025-06-12T09:15:00Z",
    },
  },
};

// ---------------------------------------------------------------------------
// ClickImportAnyway — interactive
// ---------------------------------------------------------------------------

export const ClickImportAnyway: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByText("Import anyway"));
    await expect(args.onContinue).toHaveBeenCalled();
  },
};

// ---------------------------------------------------------------------------
// ClickCancel — interactive
// ---------------------------------------------------------------------------

export const ClickCancel: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByText("Cancel"));
    await expect(args.onCancel).toHaveBeenCalled();
  },
};
