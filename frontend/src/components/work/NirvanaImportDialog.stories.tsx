import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import { http, HttpResponse } from "msw";
import { NirvanaImportDialog } from "./NirvanaImportDialog";
import { store } from "@/test/msw/fixtures";
import type { ImportJobResponse } from "@/lib/api-client";

const meta = {
  title: "Work/NirvanaImportDialog",
  component: NirvanaImportDialog,
  tags: ["autodocs"],
  args: {
    open: true,
    onClose: fn(),
  },
  beforeEach: () => {
    store.clear();
  },
} satisfies Meta<typeof NirvanaImportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// FileSelection — default state
// ---------------------------------------------------------------------------

export const FileSelection: Story = {};

export const Closed: Story = {
  args: { open: false },
};

// ---------------------------------------------------------------------------
// FullImportFlow — upload → preview → import → results
// ---------------------------------------------------------------------------

export const FullImportFlow: Story = {
  play: async ({ canvas, userEvent, step }) => {
    await step("Verify file selection step is shown", async () => {
      await waitFor(() => {
        expect(
          canvas.getByText(/Drop your Nirvana JSON export/),
        ).toBeInTheDocument();
      });
    });

    await step("Upload a file", async () => {
      const input = canvas.getByTestId(
        "nirvana-file-input",
      ) as HTMLInputElement;
      const file = new File(['{"items":[]}'], "nirvana-export.json", {
        type: "application/json",
      });
      await userEvent.upload(input, file);
    });

    await step("Verify preview step with bucket breakdown", async () => {
      await waitFor(
        () => {
          expect(canvas.getByText("42 items found")).toBeInTheDocument();
        },
        { timeout: 10000 },
      );
      expect(canvas.getByText("Include completed items")).toBeInTheDocument();
    });

    await step("Click import button", async () => {
      const importBtn = canvas.getByRole("button", {
        name: /Import \d+ items/,
      });
      await userEvent.click(importBtn);
    });

    await step("Verify results step", async () => {
      await waitFor(
        () => {
          expect(canvas.getByText("Import complete")).toBeInTheDocument();
        },
        { timeout: 10000 },
      );
      expect(canvas.getByText("35")).toBeInTheDocument(); // created
      expect(canvas.getByText("3")).toBeInTheDocument(); // updated
    });
  },
};

// ---------------------------------------------------------------------------
// ImportError — job fails and error is shown
// ---------------------------------------------------------------------------

const failedJob: ImportJobResponse = {
  job_id: "msw-job-fail",
  status: "failed",
  file_id: "file-msw-1",
  file_sha256: "abc123def456",
  source: "nirvana",
  created_at: "2026-02-09T00:00:00Z",
  updated_at: "2026-02-09T00:00:00Z",
  started_at: "2026-02-09T00:00:00Z",
  finished_at: "2026-02-09T00:00:00Z",
  summary: {
    total: 42,
    created: 35,
    updated: 3,
    skipped: 2,
    errors: 2,
    bucket_counts: {
      inbox: 10,
      next: 15,
      waiting: 5,
      someday: 7,
      reference: 5,
    },
    sample_errors: ["item[17] missing name"],
  },
  error: "Database connection lost",
};

export const ImportError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("*/api/imports/nirvana/from-file", () => {
          return HttpResponse.json(failedJob);
        }),
        http.get("*/api/imports/jobs/:jobId", () => {
          return HttpResponse.json(failedJob);
        }),
      ],
    },
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Upload a file", async () => {
      const input = canvas.getByTestId(
        "nirvana-file-input",
      ) as HTMLInputElement;
      const file = new File(['{"items":[]}'], "nirvana-export.json", {
        type: "application/json",
      });
      await userEvent.upload(input, file);
    });

    await step("Wait for preview and click import", async () => {
      await waitFor(
        () => {
          expect(canvas.getByText("42 items found")).toBeInTheDocument();
        },
        { timeout: 10000 },
      );
      const importBtn = canvas.getByRole("button", {
        name: /Import \d+ items/,
      });
      await userEvent.click(importBtn);
    });

    await step("Verify error state", async () => {
      await waitFor(
        () => {
          expect(canvas.getByText("Import failed")).toBeInTheDocument();
        },
        { timeout: 10000 },
      );
      expect(canvas.getByText("Database connection lost")).toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// InspectPreview — upload file and check bucket breakdown display
// ---------------------------------------------------------------------------

export const InspectPreview: Story = {
  play: async ({ canvas, userEvent, step }) => {
    await step("Upload a file", async () => {
      const input = canvas.getByTestId(
        "nirvana-file-input",
      ) as HTMLInputElement;
      const file = new File(['{"items":[]}'], "nirvana-export.json", {
        type: "application/json",
      });
      await userEvent.upload(input, file);
    });

    await step("Verify preview shows item counts and toggle", async () => {
      await waitFor(
        () => {
          expect(canvas.getByText("42 items found")).toBeInTheDocument();
        },
        { timeout: 10000 },
      );

      // Include completed checkbox should be present and checked
      const checkbox = canvas.getByRole("checkbox", {
        name: /Include completed items/,
      });
      expect(checkbox).toBeChecked();

      // Error info should appear
      expect(canvas.getByText(/2 items with errors/)).toBeInTheDocument();
      expect(canvas.getByText("item[17] missing name")).toBeInTheDocument();
    });
  },
};
