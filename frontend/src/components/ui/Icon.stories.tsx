import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "./Icon";

const meta = {
  title: "Primitives/Icon",
  component: Icon,
  parameters: { layout: "centered" },
  argTypes: {
    name: { control: "text" },
    size: { control: { type: "range", min: 12, max: 48 } },
    fill: { control: "boolean" },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { name: "inbox", size: 24 },
};

export const Filled: Story = {
  args: { name: "check_circle", size: 24, fill: true },
};

export const AppBuckets: Story = {
  args: { name: "inbox" },
  render: () => (
    <div className="flex items-center gap-4">
      <Icon name="inbox" className="text-app-inbox" />
      <Icon name="bolt" className="text-app-next" />
      <Icon name="folder" className="text-app-project" />
      <Icon name="schedule" className="text-app-waiting" />
      <Icon name="cloud" className="text-app-someday" />
      <Icon name="calendar_month" className="text-app-calendar" />
      <Icon name="book" className="text-app-reference" />
      <Icon name="center_focus_strong" className="text-app-focus" />
    </div>
  ),
};

export const Sizes: Story = {
  args: { name: "inbox" },
  render: () => (
    <div className="flex items-end gap-4">
      <Icon name="inbox" size={12} />
      <Icon name="inbox" size={16} />
      <Icon name="inbox" size={20} />
      <Icon name="inbox" size={24} />
      <Icon name="inbox" size={32} />
      <Icon name="inbox" size={48} />
    </div>
  ),
};
