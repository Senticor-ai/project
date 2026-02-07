import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ImportExportPanel } from "./ImportExportPanel";

const meta = {
  title: "Settings/ImportExportPanel",
  component: ImportExportPanel,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImportExportPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — all import sources and export options
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    onImportNirvana: fn(),
    onExport: fn(),
  },
};
