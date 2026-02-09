import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ImportSummaryBreakdown } from "./ImportSummaryBreakdown";

const meta = {
  title: "Work/ImportSummaryBreakdown",
  component: ImportSummaryBreakdown,
  tags: ["autodocs"],
} satisfies Meta<typeof ImportSummaryBreakdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mirrors the user's real 20K+ Nirvana import — heavily skewed toward completed. */
export const RealWorldImport: Story = {
  args: {
    bucketCounts: {
      next: 19742,
      someday: 498,
      calendar: 15,
      project: 9,
      waiting: 11,
    },
    completedCounts: {
      next: 19412,
      someday: 2,
      calendar: 1,
      project: 9,
      waiting: 11,
    },
  },
};

/** Roughly even split between active and completed. */
export const BalancedImport: Story = {
  args: {
    bucketCounts: {
      inbox: 12,
      next: 80,
      waiting: 10,
      calendar: 8,
      someday: 30,
      reference: 20,
    },
    completedCounts: {
      next: 45,
      waiting: 2,
      calendar: 3,
      someday: 10,
    },
  },
};

/** No completed items — e.g. import with include_completed=false. */
export const ActiveOnly: Story = {
  args: {
    bucketCounts: {
      inbox: 25,
      next: 60,
      waiting: 5,
      calendar: 3,
      someday: 20,
      reference: 10,
    },
  },
};

/** Heavy inbox load to triage. */
export const InboxHeavy: Story = {
  args: {
    bucketCounts: {
      inbox: 150,
      next: 20,
      someday: 5,
    },
  },
};

/** Everything is completed — active section shows inbox: 0 only. */
export const AllCompleted: Story = {
  args: {
    bucketCounts: {
      next: 500,
      waiting: 30,
      someday: 20,
    },
    completedCounts: {
      next: 500,
      waiting: 30,
      someday: 20,
    },
  },
};

/** With click handler — results step makes bucket rows clickable. */
export const Clickable: Story = {
  args: {
    bucketCounts: {
      inbox: 8,
      next: 120,
      waiting: 5,
      calendar: 3,
      someday: 40,
      project: 4,
      reference: 15,
    },
    completedCounts: {
      next: 80,
      waiting: 2,
      someday: 5,
    },
    onBucketClick: fn(),
  },
};

/** Edge case: no items at all. */
export const Empty: Story = {
  args: {
    bucketCounts: {},
  },
};
