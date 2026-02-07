import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ContextFilterBar } from "./ContextFilterBar";

const meta = {
  title: "Work/ContextFilterBar",
  component: ContextFilterBar,
  tags: ["autodocs"],
  args: {
    onToggleContext: fn(),
    onClearAll: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContextFilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoContexts: Story = {
  args: {
    contexts: [],
    selectedContexts: [],
    actionCounts: {},
  },
};

export const AllUnselected: Story = {
  args: {
    contexts: ["@phone", "@computer", "@errands", "@office"],
    selectedContexts: [],
    actionCounts: {
      "@phone": 3,
      "@computer": 7,
      "@errands": 2,
      "@office": 5,
    },
  },
};

export const SomeSelected: Story = {
  args: {
    contexts: ["@phone", "@computer", "@errands", "@office"],
    selectedContexts: ["@phone", "@computer"],
    actionCounts: {
      "@phone": 3,
      "@computer": 7,
      "@errands": 2,
      "@office": 5,
    },
  },
};

export const Interactive: Story = {
  args: {
    contexts: ["@phone", "@computer", "@errands"],
    selectedContexts: [],
    actionCounts: { "@phone": 4, "@computer": 6, "@errands": 1 },
  },
  play: async ({ canvas, userEvent }) => {
    const phoneChip = canvas.getByRole("checkbox", { name: /@phone/ });
    expect(phoneChip).toHaveAttribute("aria-checked", "false");

    await userEvent.click(phoneChip);

    const computerChip = canvas.getByRole("checkbox", { name: /@computer/ });
    await userEvent.click(computerChip);
  },
};
