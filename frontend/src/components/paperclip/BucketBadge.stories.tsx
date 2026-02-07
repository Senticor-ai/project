import type { Meta, StoryObj } from "@storybook/react-vite";
import { BucketBadge } from "./BucketBadge";
import type { GtdBucket } from "@/model/gtd-types";

const meta = {
  title: "Primitives/BucketBadge",
  component: BucketBadge,
  tags: ["autodocs"],
  argTypes: {
    bucket: {
      control: "select",
      options: [
        "inbox",
        "next",
        "project",
        "waiting",
        "someday",
        "calendar",
        "reference",
        "focus",
      ] satisfies GtdBucket[],
    },
    showLabel: { control: "boolean" },
  },
} satisfies Meta<typeof BucketBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inbox: Story = {
  args: { bucket: "inbox", showLabel: true },
};

export const NextAction: Story = {
  args: { bucket: "next", showLabel: true },
};

export const Project: Story = {
  args: { bucket: "project", showLabel: true },
};

export const Focus: Story = {
  args: { bucket: "focus", showLabel: true },
};

export const IconOnly: Story = {
  args: { bucket: "waiting", showLabel: false },
};

export const AllBuckets: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(
        [
          "inbox",
          "next",
          "project",
          "waiting",
          "someday",
          "calendar",
          "reference",
          "focus",
        ] satisfies GtdBucket[]
      ).map((b) => (
        <BucketBadge key={b} bucket={b} />
      ))}
    </div>
  ),
};
