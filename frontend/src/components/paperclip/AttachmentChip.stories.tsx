import type { Meta, StoryObj } from "@storybook/react-vite";
import { AttachmentChip } from "./AttachmentChip";
import type { ReferenceType } from "@/model/types";

const meta = {
  title: "Primitives/AttachmentChip",
  component: AttachmentChip,
  tags: ["autodocs"],
  argTypes: {
    referenceType: {
      control: "select",
      options: [
        "blocks",
        "depends_on",
        "delegates_to",
        "refers_to",
        "context_of",
        "part_of",
        "follows",
        "waiting_on",
      ] satisfies ReferenceType[],
    },
  },
} satisfies Meta<typeof AttachmentChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Blocks: Story = {
  args: {
    referenceType: "blocks",
    targetTitle: "Get stakeholder approval",
  },
};

export const DependsOn: Story = {
  args: {
    referenceType: "depends_on",
    targetTitle: "Finalize design system",
  },
};

export const DelegatesTo: Story = {
  args: {
    referenceType: "delegates_to",
    targetTitle: "Sarah M.",
  },
};

export const WaitingOn: Story = {
  args: {
    referenceType: "waiting_on",
    targetTitle: "Vendor response",
  },
};

export const AllTypes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(
        [
          "blocks",
          "depends_on",
          "delegates_to",
          "refers_to",
          "context_of",
          "part_of",
          "follows",
          "waiting_on",
        ] satisfies ReferenceType[]
      ).map((t) => (
        <AttachmentChip
          key={t}
          referenceType={t}
          targetTitle={`Example ${t}`}
        />
      ))}
    </div>
  ),
};
