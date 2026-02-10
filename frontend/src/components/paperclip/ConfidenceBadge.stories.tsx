import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfidenceBadge } from "./ConfidenceBadge";

const meta = {
  title: "Primitives/ConfidenceBadge",
  component: ConfidenceBadge,
  argTypes: {
    confidence: {
      control: "select",
      options: ["high", "medium", "low"],
    },
    needsEnrichment: { control: "boolean" },
    showLabel: { control: "boolean" },
  },
} satisfies Meta<typeof ConfidenceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const High: Story = {
  args: { confidence: "high", needsEnrichment: false, showLabel: true },
};

export const Medium: Story = {
  args: { confidence: "medium", needsEnrichment: false, showLabel: true },
};

export const Low: Story = {
  args: { confidence: "low", needsEnrichment: false, showLabel: true },
};

export const NeedsEnrichment: Story = {
  args: { confidence: "low", needsEnrichment: true, showLabel: true },
};

export const AllStates: Story = {
  args: { confidence: "high", needsEnrichment: false },
  render: () => (
    <div className="flex items-center gap-4">
      <ConfidenceBadge confidence="high" needsEnrichment={false} showLabel />
      <ConfidenceBadge confidence="medium" needsEnrichment={false} showLabel />
      <ConfidenceBadge confidence="low" needsEnrichment={false} showLabel />
      <ConfidenceBadge confidence="low" needsEnrichment={true} showLabel />
    </div>
  ),
};
