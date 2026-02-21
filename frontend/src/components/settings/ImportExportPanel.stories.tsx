import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect } from "storybook/test";
import { ImportExportPanel } from "./ImportExportPanel";
import type { ImportJobData } from "./ImportJobRow";

const sampleJobs: ImportJobData[] = [
  {
    job_id: "job-4",
    status: "completed",
    source: "native",
    total: 310,
    created_at: "2025-06-17T09:00:00Z",
    started_at: "2025-06-17T09:00:01Z",
    finished_at: "2025-06-17T09:01:12Z",
    summary: {
      total: 310,
      created: 305,
      updated: 0,
      skipped: 5,
      errors: 0,
    },
    progress: null,
    error: null,
  },
  {
    job_id: "job-3",
    status: "running",
    source: "nirvana",
    total: 95,
    created_at: "2025-06-16T11:00:00Z",
    started_at: "2025-06-16T11:00:02Z",
    finished_at: null,
    summary: null,
    progress: {
      processed: 42,
      total: 95,
      created: 35,
      updated: 4,
      skipped: 2,
      errors: 1,
    },
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
    progress: null,
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
    progress: null,
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
    onImportNative: fn(),
    onImportNirvana: fn(),
    onExport: fn(),
  },
};

// ---------------------------------------------------------------------------
// WithImportJobs — shows recent import history (including native source)
// ---------------------------------------------------------------------------

export const WithImportJobs: Story = {
  args: {
    onImportNative: fn(),
    onImportNirvana: fn(),
    onExport: fn(),
    importJobs: sampleJobs,
  },
};

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

export const ImportNative: Story = {
  args: {
    onImportNative: fn(),
    onImportNirvana: fn(),
    onExport: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    // Senticor Project source card visible
    expect(canvas.getByText("Senticor Project")).toBeInTheDocument();

    // Click Senticor Project import button
    await userEvent.click(
      canvas.getByRole("button", { name: /Import from Senticor Project/ }),
    );
    expect(args.onImportNative).toHaveBeenCalled();
  },
};

export const ImportNirvana: Story = {
  args: {
    onImportNative: fn(),
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
    onImportNative: fn(),
    onImportNirvana: fn(),
    onExport: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    // Click JSON export with default filter state (both off)
    await userEvent.click(canvas.getByRole("button", { name: "Export JSON" }));
    expect(args.onExport).toHaveBeenCalledWith({
      includeArchived: false,
      includeCompleted: false,
    });
  },
};

export const ExportWithFilters: Story = {
  args: {
    onImportNative: fn(),
    onImportNirvana: fn(),
    onExport: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    // Toggle both checkboxes on
    await userEvent.click(canvas.getByLabelText("Include archived"));
    await userEvent.click(canvas.getByLabelText("Include completed"));

    // Export with both filters enabled
    await userEvent.click(canvas.getByRole("button", { name: "Export JSON" }));
    expect(args.onExport).toHaveBeenCalledWith({
      includeArchived: true,
      includeCompleted: true,
    });
  },
};
