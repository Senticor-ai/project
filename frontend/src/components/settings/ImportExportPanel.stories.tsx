import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect } from "storybook/test";
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

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

export const ImportNirvana: Story = {
  args: {
    onImportNirvana: fn(),
    onExport: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    // Nirvana source card visible
    expect(canvas.getByText("Nirvana")).toBeInTheDocument();

    // Click Nirvana import button
    await userEvent.click(
      canvas.getByRole("button", { name: /Import from Nirvana/ }),
    );
    expect(args.onImportNirvana).toHaveBeenCalled();
  },
};

export const ExportActions: Story = {
  args: {
    onImportNirvana: fn(),
    onExport: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    // Click JSON export
    await userEvent.click(
      canvas.getByRole("button", { name: "Export as JSON" }),
    );
    expect(args.onExport).toHaveBeenCalledWith("json");

    // Click CSV export
    await userEvent.click(
      canvas.getByRole("button", { name: "Export as CSV" }),
    );
    expect(args.onExport).toHaveBeenCalledWith("csv");
  },
};
