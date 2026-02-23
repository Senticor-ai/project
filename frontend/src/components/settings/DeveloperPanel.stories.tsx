import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { DeveloperPanel, type PwaStorageStats } from "./DeveloperPanel";

const meta = {
  title: "Settings/DeveloperPanel",
  component: DeveloperPanel,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="p-4" style={{ maxWidth: 600 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DeveloperPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — idle state
// ---------------------------------------------------------------------------

const mockFlushResult = {
  ok: true as const,
  deleted: {
    items: 128,
    assertions: 34,
    search_index_jobs: 128,
    idempotency_keys: 45,
    import_jobs: 2,
    file_uploads: 1,
    files: 1,
  },
};

const mockStorageStats: PwaStorageStats = {
  originUsage: 4_400_000,
  originQuota: 2_100_000_000,
  cachedQueryCount: 142,
  queryCacheSize: 1_300_000,
  cacheNames: ["items-sync", "workbox-precache-v2"],
  serviceWorkerActive: true,
  loading: false,
};

export const Default: Story = {
  args: {
    onFlush: fn(async () => mockFlushResult),
    storageStats: mockStorageStats,
    onClearLocalCache: fn(async () => {}),
  },
};

// ---------------------------------------------------------------------------
// Flush flow — confirm and execute
// ---------------------------------------------------------------------------

export const FlushFlow: Story = {
  args: {
    onFlush: fn(async () => ({
      ok: true as const,
      deleted: { items: 42, assertions: 5, files: 3 },
    })),
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Click flush button", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: /flush all data/i }),
      );
    });

    await step("Type FLUSH and confirm", async () => {
      const input = canvas.getByLabelText(/type flush to confirm/i);
      await userEvent.type(input, "FLUSH");
      await userEvent.click(
        canvas.getByRole("button", { name: /confirm flush/i }),
      );
    });

    await step("Verify result is shown", async () => {
      await waitFor(() => {
        expect(canvas.getByText(/data flushed/i)).toBeInTheDocument();
      });
      const main = within(canvas.getByText(/data flushed/i).closest("div")!);
      await expect(main.getByText(/items: 42/)).toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// StorageStatsLoading — shows loading placeholders
// ---------------------------------------------------------------------------

export const StorageStatsLoading: Story = {
  args: {
    onFlush: fn(async () => mockFlushResult),
    storageStats: { ...mockStorageStats, loading: true },
    onClearLocalCache: fn(async () => {}),
  },
};

// ---------------------------------------------------------------------------
// ClearCacheFlow — clear local cache confirmation and success
// ---------------------------------------------------------------------------

export const ClearCacheFlow: Story = {
  args: {
    onFlush: fn(async () => mockFlushResult),
    storageStats: mockStorageStats,
    onClearLocalCache: fn(async () => {}),
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Click clear button", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: /clear local cache/i }),
      );
    });

    await step("Confirm clear", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /confirm/i }));
    });

    await step("Verify success message", async () => {
      await waitFor(() => {
        expect(
          canvas.getByText(/local cache cleared successfully/i),
        ).toBeInTheDocument();
      });
    });
  },
};

// ---------------------------------------------------------------------------
// NoServiceWorker — SW not registered
// ---------------------------------------------------------------------------

export const NoServiceWorker: Story = {
  args: {
    onFlush: fn(async () => mockFlushResult),
    storageStats: {
      ...mockStorageStats,
      serviceWorkerActive: false,
      cacheNames: [],
    },
    onClearLocalCache: fn(async () => {}),
  },
};
