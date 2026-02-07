import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NirvanaImportDialog } from "./NirvanaImportDialog";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const meta = {
  title: "GTD/NirvanaImportDialog",
  component: NirvanaImportDialog,
  tags: ["autodocs"],
  args: {
    open: true,
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof NirvanaImportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FileSelection: Story = {};

export const Closed: Story = {
  args: { open: false },
};
