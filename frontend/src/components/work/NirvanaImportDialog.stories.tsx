import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { NirvanaImportDialog } from "./NirvanaImportDialog";

const meta = {
  title: "Work/NirvanaImportDialog",
  component: NirvanaImportDialog,
  tags: ["autodocs"],
  args: {
    open: true,
    onClose: fn(),
  },
} satisfies Meta<typeof NirvanaImportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FileSelection: Story = {};

export const Closed: Story = {
  args: { open: false },
};
