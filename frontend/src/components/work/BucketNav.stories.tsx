import { useState } from "react";
import { DndContext } from "@dnd-kit/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { BucketNav } from "./BucketNav";
import { createProject } from "@/model/factories";
import type { Bucket } from "@/model/types";

const sampleProjects = [
  createProject({
    name: "Steuererklärung 2024",
    desiredOutcome: "Filed and archived",
    isFocused: true,
    status: "active",
  }),
  createProject({
    name: "Steuererklärung 2025",
    desiredOutcome: "File by deadline",
    isFocused: true,
    status: "active",
  }),
  createProject({
    name: "Büro-Umzug",
    desiredOutcome: "New office ready",
    isFocused: false,
    status: "active",
  }),
  createProject({
    name: "Altes Projekt",
    desiredOutcome: "Done",
    isFocused: false,
    status: "archived",
  }),
];

const meta = {
  title: "Work/BucketNav",
  component: BucketNav,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <DndContext>
        <div className="w-56 rounded-lg border border-border bg-surface p-2">
          <Story />
        </div>
      </DndContext>
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

// ---------------------------------------------------------------------------
// Starred projects — isFocused projects appear as sub-items under Projects
// ---------------------------------------------------------------------------

/** Starred projects (isFocused=true, status=active) show as indented sub-items under Projects. */
export const WithStarredProjects: Story = {
  args: {
    activeBucket: "inbox",
    onSelect: fn(),
    counts: { inbox: 4, project: 3 },
    projects: sampleProjects,
  },
  play: async ({ canvas, step }) => {
    const nav = canvas.getByRole("navigation", { name: "Buckets" });
    const sidebar = within(nav);

    await step("Starred projects visible under Projects nav item", async () => {
      // The two starred (isFocused) projects should be visible
      await expect(
        sidebar.getByText("Steuererklärung 2024"),
      ).toBeInTheDocument();
      await expect(
        sidebar.getByText("Steuererklärung 2025"),
      ).toBeInTheDocument();
    });

    await step("Non-starred active project is not visible", async () => {
      await expect(sidebar.queryByText("Büro-Umzug")).not.toBeInTheDocument();
    });

    await step("Archived project is not visible", async () => {
      await expect(
        sidebar.queryByText("Altes Projekt"),
      ).not.toBeInTheDocument();
    });
  },
};

/** Starred projects are droppable targets (visual spec — shows drop label). */
export const StarredProjectDropTargets: Story = {
  args: {
    activeBucket: "inbox",
    onSelect: fn(),
    counts: { inbox: 4, project: 3 },
    projects: sampleProjects,
  },
  play: async ({ canvas, step }) => {
    const nav = canvas.getByRole("navigation", { name: "Buckets" });
    const sidebar = within(nav);

    await step("Each starred project has a drop target label", async () => {
      await expect(
        sidebar.getByLabelText("Drop into Steuererklärung 2024"),
      ).toBeInTheDocument();
      await expect(
        sidebar.getByLabelText("Drop into Steuererklärung 2025"),
      ).toBeInTheDocument();
    });
  },
};

/** No projects passed — sidebar renders without project sub-items. */
export const WithoutProjects: Story = {
  args: {
    activeBucket: "inbox",
    onSelect: fn(),
    counts: { inbox: 4, next: 12 },
  },
};

/** Mobile viewport — verify touch target sizes. */
export const MobileTouchTargets: Story = {
  globals: { viewport: { value: "iphone14", isRotated: false } },
  args: {
    activeBucket: "inbox",
    onSelect: fn(),
    counts: { inbox: 4, next: 12, focus: 3 },
  },
};
