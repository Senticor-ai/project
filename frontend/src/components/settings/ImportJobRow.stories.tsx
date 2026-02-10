import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImportJobRow, type ImportJobData } from "./ImportJobRow";

const completedJob: ImportJobData = {
  job_id: "job-1",
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
};

const meta = {
  title: "Settings/ImportJobRow",
  component: ImportJobRow,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-md p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImportJobRow>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Completed — with summary counts
// ---------------------------------------------------------------------------

export const Completed: Story = {
  args: {
    job: completedJob,
  },
};

// ---------------------------------------------------------------------------
// Running — spinning sync icon
// ---------------------------------------------------------------------------

export const Running: Story = {
  args: {
    job: {
      ...completedJob,
      status: "running",
      finished_at: null,
      summary: null,
    },
  },
};

// ---------------------------------------------------------------------------
// RunningWithProgress — shows live X / Y progress
// ---------------------------------------------------------------------------

export const RunningWithProgress: Story = {
  args: {
    job: {
      ...completedJob,
      status: "running",
      finished_at: null,
      summary: null,
      progress: {
        processed: 67,
        total: 142,
        created: 55,
        updated: 8,
        skipped: 3,
        errors: 1,
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Queued — waiting to start
// ---------------------------------------------------------------------------

export const Queued: Story = {
  args: {
    job: {
      ...completedJob,
      status: "queued",
      started_at: null,
      finished_at: null,
      summary: null,
    },
  },
};

// ---------------------------------------------------------------------------
// Failed — with error message
// ---------------------------------------------------------------------------

export const Failed: Story = {
  args: {
    job: {
      ...completedJob,
      status: "failed",
      finished_at: "2025-06-15T10:00:12Z",
      summary: null,
      error: "Worker timeout: job exceeded maximum execution time of 300s",
    },
  },
};

// ---------------------------------------------------------------------------
// CompletedNoErrors — clean import
// ---------------------------------------------------------------------------

export const CompletedNoErrors: Story = {
  args: {
    job: {
      ...completedJob,
      summary: {
        total: 142,
        created: 130,
        updated: 12,
        skipped: 0,
        errors: 0,
      },
    },
  },
};
