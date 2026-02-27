import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SwipeableRow, type SwipeIndicatorConfig } from "./SwipeableRow";
import { Icon } from "@/components/ui/Icon";

const nextIndicator: SwipeIndicatorConfig = {
  bucket: "next",
  label: "Next Actions",
  icon: "bolt",
  colorClass: "text-app-next",
  bgClass: "bg-app-next/15",
  bgCommitClass: "bg-app-next/30",
  borderClass: "border-app-next/30",
};

const waitingIndicator: SwipeIndicatorConfig = {
  bucket: "waiting",
  label: "Waiting For",
  icon: "schedule",
  colorClass: "text-app-waiting",
  bgClass: "bg-app-waiting/15",
  bgCommitClass: "bg-app-waiting/30",
  borderClass: "border-app-waiting/30",
};

function SampleRow({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-surface px-3 py-3">
      <Icon
        name="check_box_outline_blank"
        size={18}
        className="text-text-muted"
      />
      <span className="flex-1 text-sm font-medium text-text">{title}</span>
      <Icon name="more_vert" size={16} className="text-text-subtle" />
    </div>
  );
}

const meta = {
  title: "Work/SwipeableRow",
  component: SwipeableRow,
  parameters: {
    layout: "padded",
    viewport: { defaultViewport: "mobile1" },
  },
} satisfies Meta<typeof SwipeableRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onSwipeRight: fn(),
    onSwipeLeft: fn(),
    rightIndicator: nextIndicator,
    leftIndicator: waitingIndicator,
    children: <SampleRow title="Review budget proposal" />,
  },
};

export const RightOnly: Story = {
  args: {
    onSwipeRight: fn(),
    rightIndicator: nextIndicator,
    children: <SampleRow title="Call insurance company" />,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    onSwipeRight: fn(),
    onSwipeLeft: fn(),
    rightIndicator: nextIndicator,
    leftIndicator: waitingIndicator,
    children: <SampleRow title="Multi-select active — swipe disabled" />,
  },
};

export const MultipleRows: Story = {
  args: {
    children: null,
  },
  render: () => (
    <div className="flex flex-col gap-1">
      {["Read email from HR", "Book dentist appointment", "Review PR #42"].map(
        (title) => (
          <SwipeableRow
            key={title}
            onSwipeRight={fn()}
            onSwipeLeft={fn()}
            rightIndicator={nextIndicator}
            leftIndicator={waitingIndicator}
          >
            <SampleRow title={title} />
          </SwipeableRow>
        ),
      )}
    </div>
  ),
};
