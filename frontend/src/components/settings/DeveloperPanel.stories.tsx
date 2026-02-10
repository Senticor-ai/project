import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { DeveloperPanel } from "./DeveloperPanel";

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

export const Default: Story = {
  args: {
    onFlush: fn(async () => mockFlushResult),
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
