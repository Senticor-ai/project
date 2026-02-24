import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tooltip } from "./Tooltip";
import { Icon } from "./Icon";

const meta = {
  title: "Primitives/Tooltip",
  component: Tooltip,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="flex min-h-[120px] items-center justify-center p-12">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Archive",
    children: (
      <button
        aria-label="Archive"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] text-text-muted hover:text-text"
      >
        <Icon name="archive" size={18} />
      </button>
    ),
  },
};

export const DerivedFromAriaLabel: Story = {
  args: {
    children: (
      <button
        aria-label="Star project"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] text-text-muted hover:text-text"
      >
        <Icon name="star_outline" size={18} />
      </button>
    ),
  },
};

export const BottomPlacement: Story = {
  args: {
    label: "Edit",
    placement: "bottom",
    children: (
      <button
        aria-label="Edit"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] text-text-muted hover:text-text"
      >
        <Icon name="edit" size={18} />
      </button>
    ),
  },
};

export const IconButtonRow: Story = {
  args: {
    children: null,
  },
  render: () => (
    <div className="flex items-center gap-1">
      <Tooltip>
        <button
          aria-label="Complete task"
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-muted hover:text-text"
        >
          <Icon name="check_box_outline_blank" size={18} />
        </button>
      </Tooltip>
      <Tooltip>
        <button
          aria-label="Focus task"
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-muted hover:text-app-focus"
        >
          <Icon name="star_outline" size={18} />
        </button>
      </Tooltip>
      <Tooltip>
        <button
          aria-label="Edit task"
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-subtle hover:text-text"
        >
          <Icon name="edit" size={16} />
        </button>
      </Tooltip>
      <Tooltip>
        <button
          aria-label="More actions"
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-subtle hover:text-text"
        >
          <Icon name="more_vert" size={16} />
        </button>
      </Tooltip>
    </div>
  ),
};
