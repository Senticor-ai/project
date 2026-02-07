import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import { InboxTriage } from "./InboxTriage";
import { createProject, resetFactoryCounter } from "@/model/factories";

resetFactoryCounter();

const sampleProjects = [
  createProject({
    title: "Website Redesign",
    desiredOutcome: "New site live",
  }),
  createProject({
    title: "Q1 Planning",
    desiredOutcome: "Q1 goals defined",
  }),
  createProject({
    title: "Office Relocation",
    desiredOutcome: "Moved to new office",
  }),
];

const meta = {
  title: "GTD/InboxTriage",
  component: InboxTriage,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-lg border border-border bg-surface-raised p-4">
        <p className="mb-2 text-sm font-semibold text-text">
          Anruf bei Frau Müller wegen Fahrkostenantrag
        </p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InboxTriage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onTriage: fn(),
  },
};

export const WithProjects: Story = {
  args: {
    onTriage: fn(),
    projects: sampleProjects,
  },
};

/** Click a bucket button and verify the triage result. */
export const BucketAction: Story = {
  args: {
    onTriage: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByLabelText("Move to Next"));
    await expect(args.onTriage!).toHaveBeenCalledWith(
      expect.objectContaining({ targetBucket: "next" }),
    );
  },
};

/** Archive a triage item. */
export const ArchiveAction: Story = {
  args: {
    onTriage: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByLabelText("Archive"));
    await expect(args.onTriage!).toHaveBeenCalledWith({
      targetBucket: "archive",
    });
  },
};

/** Expand the options panel and interact with date, energy, and contexts. */
export const ExpandedOptions: Story = {
  args: {
    onTriage: fn(),
    projects: sampleProjects,
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Expand options", async () => {
      await userEvent.click(canvas.getByText("More options"));
      await expect(canvas.getByText("Less options")).toBeInTheDocument();
    });

    await step("Set date", async () => {
      const dateInput = canvas.getByLabelText("Date");
      await userEvent.clear(dateInput);
      await userEvent.type(dateInput, "2026-03-15");
    });

    await step("Select energy level", async () => {
      await userEvent.click(canvas.getByText("high"));
      await expect(canvas.getByText("high")).toHaveClass("font-medium");
    });

    await step("Toggle energy off then on again", async () => {
      await userEvent.click(canvas.getByText("high"));
      await userEvent.click(canvas.getByText("low"));
    });

    await step("Add contexts via button and Enter key", async () => {
      const contextInput = canvas.getByPlaceholderText("@phone, @office...");
      await userEvent.type(contextInput, "@phone");
      await userEvent.click(canvas.getByText("Add"));
      await expect(canvas.getByText("@phone")).toBeInTheDocument();

      await userEvent.type(contextInput, "@office");
      await userEvent.keyboard("{Enter}");
      await expect(canvas.getByText("@office")).toBeInTheDocument();
    });

    await step("Remove a context", async () => {
      await userEvent.click(canvas.getByLabelText("Remove @phone"));
    });
  },
};

/** Select a project and triage with all optional fields. */
export const FullTriage: Story = {
  args: {
    onTriage: fn(),
    projects: sampleProjects,
  },
  play: async ({ canvas, userEvent, step, args }) => {
    const projectId = sampleProjects[0]!.id;

    await step("Expand and fill all fields", async () => {
      await userEvent.click(canvas.getByText("More options"));

      const projectSelect = canvas.getByLabelText("Assign to project");
      await userEvent.selectOptions(projectSelect, projectId);

      const dateInput = canvas.getByLabelText("Date");
      await userEvent.clear(dateInput);
      await userEvent.type(dateInput, "2026-04-01");

      await userEvent.click(canvas.getByText("medium"));

      const contextInput = canvas.getByPlaceholderText("@phone, @office...");
      await userEvent.type(contextInput, "@desk");
      await userEvent.click(canvas.getByText("Add"));
    });

    await step("Triage to calendar", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Calendar"));
      await expect(args.onTriage!).toHaveBeenCalledWith(
        expect.objectContaining({
          targetBucket: "calendar",
          projectId: projectId,
          date: "2026-04-01",
          energyLevel: "medium",
          contexts: ["@desk"],
        }),
      );
    });
  },
};

/** Collapse after expanding. */
export const CollapseAfterExpand: Story = {
  args: {
    onTriage: fn(),
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Expand", async () => {
      await userEvent.click(canvas.getByText("More options"));
      await expect(canvas.getByText("Less options")).toBeInTheDocument();
    });

    await step("Collapse", async () => {
      await userEvent.click(canvas.getByText("Less options"));
      await expect(canvas.getByText("More options")).toBeInTheDocument();
    });

    // Wait for AnimatePresence exit animation to fully unmount
    await waitFor(() => {
      expect(canvas.queryByLabelText("Date")).not.toBeInTheDocument();
    });
  },
};
