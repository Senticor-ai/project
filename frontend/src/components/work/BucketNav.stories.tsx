import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { BucketNav } from "./BucketNav";
import type { Bucket } from "@/model/types";

const meta = {
  title: "Work/BucketNav",
  component: BucketNav,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-56 rounded-lg border border-border bg-surface p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BucketNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    activeBucket: "inbox",
    onSelect: fn(),
    counts: {
      inbox: 4,
      next: 12,
      project: 3,
      waiting: 2,
      calendar: 1,
    },
  },
};

export const FocusActive: Story = {
  args: {
    activeBucket: "focus",
    onSelect: fn(),
    counts: { focus: 5, inbox: 2 },
  },
};

export const Interactive: Story = {
  args: {
    activeBucket: "inbox",
    onSelect: fn(),
  },
  render: function InteractiveNav() {
    const [active, setActive] = useState<Bucket>("inbox");

    return (
      <BucketNav
        activeBucket={active}
        onSelect={setActive}
        counts={{
          inbox: 4,
          next: 12,
          project: 3,
          waiting: 2,
          focus: 5,
          calendar: 1,
        }}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "Buckets" });
    const sidebar = within(nav);

    await step("Click Next — gets aria-current=page", async () => {
      const nextBtn = sidebar.getByText("Next").closest("button")!;
      await userEvent.click(nextBtn);
      await expect(nextBtn).toHaveAttribute("aria-current", "page");
    });

    await step(
      "Click Calendar — Calendar active, Next loses active",
      async () => {
        const calBtn = sidebar.getByText("Calendar").closest("button")!;
        await userEvent.click(calBtn);
        await expect(calBtn).toHaveAttribute("aria-current", "page");

        const nextBtn = sidebar.getByText("Next").closest("button")!;
        await expect(nextBtn).not.toHaveAttribute("aria-current");
      },
    );

    await step("Count badges are visible for buckets with counts", async () => {
      // "12" badge for Next, "4" for Inbox, "1" for Calendar
      await expect(sidebar.getByText("12")).toBeInTheDocument();
      await expect(sidebar.getByText("4")).toBeInTheDocument();
      await expect(sidebar.getByText("1")).toBeInTheDocument();
    });
  },
};
