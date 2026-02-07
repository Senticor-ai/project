import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect } from "storybook/test";
import { ImportExportPanel } from "./ImportExportPanel";
import type { ImportJobData } from "./ImportJobRow";

const sampleJobs: ImportJobData[] = [
  {
    job_id: "job-3",
    status: "running",
    source: "nirvana",
    total: 95,
    created_at: "2025-06-16T11:00:00Z",
    started_at: "2025-06-16T11:00:02Z",
    finished_at: null,
    summary: null,
    error: null,
  },
  {
    job_id: "job-2",
    status: "completed",
    source: "nirvana",
    total: 142,
    created_at: "2025-06-15T10:00:00Z",
    started_at: "2025-06-15T10:00:01Z",
    finished_at: "2025-06-15T10:00:45Z",
    summary: {
      total: 142,
      created: 120,
      updated: 15,
      skipped: 5,
      errors: 2,
    },
    error: null,
  },
  {
    job_id: "job-1",
    status: "failed",
    source: "nirvana",
    total: 200,
    created_at: "2025-06-14T08:30:00Z",
    started_at: "2025-06-14T08:30:01Z",
    finished_at: "2025-06-14T08:30:12Z",
    summary: null,
    error: "Worker timeout: exceeded 300s limit",
  },
];

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
// Default — all import sources and export options (no jobs)
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    onImportNirvana: fn(),
    onExport: fn(),
  },
};

// ---------------------------------------------------------------------------
// WithImportJobs — shows recent import history
// ---------------------------------------------------------------------------

export const WithImportJobs: Story = {
  args: {
    onImportNirvana: fn(),
    onExport: fn(),
    importJobs: sampleJobs,
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
