import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import { ProjectTree } from "./ProjectTree";
import type { Thing, Project } from "@/model/types";
import {
  createThing,
  createProject,
  resetFactoryCounter,
} from "@/model/factories";

resetFactoryCounter();

const project1 = createProject({
  name: "Website Redesign",
  desiredOutcome: "New site live and indexed by Google",
  status: "active",
});

const project2 = createProject({
  name: "Mobile App Launch",
  desiredOutcome: "App in both stores with 4+ star rating",
  status: "active",
});

const project3 = createProject({
  name: "Internal Tool Migration",
  desiredOutcome: "Legacy tool fully replaced",
  status: "completed",
});

const sampleActions: Thing[] = [
  createThing({
    rawCapture: "Finalize brand guidelines",
    bucket: "next",
    projectId: project1.id,
    sequenceOrder: 1,
    completedAt: "2026-01-15T10:00:00Z",
  }),
  createThing({
    rawCapture: "Design homepage wireframes",
    bucket: "next",
    projectId: project1.id,
    sequenceOrder: 2,
  }),
  createThing({
    rawCapture: "Implement responsive layout",
    bucket: "next",
    projectId: project1.id,
    sequenceOrder: 3,
  }),
  createThing({
    rawCapture: "Write copy for landing page",
    bucket: "next",
    projectId: project1.id,
    sequenceOrder: 4,
  }),
  createThing({
    rawCapture: "Set up CI/CD pipeline",
    bucket: "next",
    projectId: project2.id,
    sequenceOrder: 1,
    isFocused: true,
  }),
  createThing({
    rawCapture: "Implement push notifications",
    bucket: "next",
    projectId: project2.id,
    sequenceOrder: 2,
  }),
];

const sampleProjects: Project[] = [project1, project2, project3];

const meta = {
  title: "Work/ProjectTree",
  component: ProjectTree,
  args: {
    onCompleteAction: fn(),
    onToggleFocus: fn(),
    onAddAction: fn(),
    onCreateProject: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    projects: sampleProjects,
    actions: sampleActions,
  },
};

export const SingleProject: Story = {
  args: {
    projects: [project1],
    actions: sampleActions.filter((a) => a.projectIds.includes(project1.id)),
  },
};

export const EmptyProject: Story = {
  args: {
    projects: [
      createProject({
        name: "Stalled Project",
        desiredOutcome: "Needs next action",
        status: "active",
      }),
    ],
    actions: [],
  },
};

export const NoProjects: Story = {
  args: {
    projects: [],
    actions: [],
  },
};

/** Toggle non-active (completed, on-hold) projects visible/hidden. */
export const ToggleInactiveProjects: Story = {
  args: {
    projects: [
      project1,
      project2,
      project3,
      createProject({
        name: "Deferred Audit",
        desiredOutcome: "On hold until Q3",
        status: "on-hold",
      }),
    ],
    actions: sampleActions,
  },
  play: async ({ canvas, userEvent, step }) => {
    // Default: only active projects shown
    await expect(canvas.getByText("Website Redesign")).toBeInTheDocument();
    await expect(canvas.getByText("Mobile App Launch")).toBeInTheDocument();
    await expect(
      canvas.queryByText("Internal Tool Migration"),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText("Deferred Audit")).not.toBeInTheDocument();
    await expect(canvas.getByText("2 projects")).toBeInTheDocument();

    await step("Show all projects", async () => {
      await userEvent.click(canvas.getByLabelText("Show all projects"));
    });

    // Non-active projects now visible
    await expect(
      canvas.getByText("Internal Tool Migration"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Deferred Audit")).toBeInTheDocument();
    await expect(canvas.getByText("2 inactive")).toBeInTheDocument();
    await expect(canvas.getByText("(+2 inactive)")).toBeInTheDocument();

    // Status badges visible
    await expect(canvas.getByText("completed")).toBeInTheDocument();
    await expect(canvas.getByText("on-hold")).toBeInTheDocument();

    await step("Show active only", async () => {
      await userEvent.click(canvas.getByLabelText("Show active only"));
    });

    // Back to hidden
    await expect(
      canvas.queryByText("Internal Tool Migration"),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText("Deferred Audit")).not.toBeInTheDocument();
    await expect(canvas.getByText("2 projects")).toBeInTheDocument();
  },
};

export const ExpandCollapse: Story = {
  args: {
    projects: sampleProjects,
    actions: sampleActions,
  },
  play: async ({ canvas, userEvent }) => {
    // Expand first project
    await userEvent.click(canvas.getByLabelText("Expand Website Redesign"));

    // Verify action is visible
    await waitFor(
      () => {
        expect(canvas.getByText("Design homepage wireframes")).toBeTruthy();
      },
      { timeout: 5000 },
    );

    // Expand second project (first should collapse)
    await userEvent.click(canvas.getByLabelText("Expand Mobile App Launch"));
    await waitFor(
      () => {
        expect(canvas.getByText("Set up CI/CD pipeline")).toBeTruthy();
      },
      { timeout: 5000 },
    );
  },
};

export const SequentialActions: Story = {
  args: {
    projects: [project1],
    actions: sampleActions.filter((a) => a.projectIds.includes(project1.id)),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Expand Website Redesign"));

    // Verify completed, next, and future actions are all visible
    await waitFor(
      () => {
        expect(canvas.getByText("Finalize brand guidelines")).toBeTruthy();
        expect(canvas.getByText("Design homepage wireframes")).toBeTruthy();
        expect(canvas.getByText("Implement responsive layout")).toBeTruthy();
      },
      { timeout: 5000 },
    );
  },
};

/** Inline project creation form: open, fill, submit. */
export const CreateProject: Story = {
  args: {
    projects: [project1],
    actions: sampleActions.filter((a) => a.projectIds.includes(project1.id)),
  },
  play: async ({ canvas, userEvent, args, step }) => {
    await step("Open creation form", async () => {
      await userEvent.click(canvas.getByLabelText("Create project"));
    });

    // Form should be visible
    await expect(canvas.getByLabelText("Project name")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Desired outcome")).toBeInTheDocument();

    await step("Fill in project details", async () => {
      await userEvent.type(
        canvas.getByLabelText("Project name"),
        "New Feature Sprint",
      );
      await userEvent.type(
        canvas.getByLabelText("Desired outcome"),
        "Feature shipped to production",
      );
    });

    await step("Submit form", async () => {
      await userEvent.click(canvas.getByText("Create"));
    });

    // onCreateProject should have been called
    await waitFor(() => {
      expect(args.onCreateProject).toHaveBeenCalledWith(
        "New Feature Sprint",
        "Feature shipped to production",
      );
    });

    // Form should be hidden after submit
    await waitFor(() => {
      expect(canvas.queryByLabelText("Project name")).not.toBeInTheDocument();
    });
  },
};

/** Cancel closes the creation form without calling onCreateProject. */
export const CreateProjectCancel: Story = {
  args: {
    projects: [project1],
    actions: sampleActions.filter((a) => a.projectIds.includes(project1.id)),
  },
  play: async ({ canvas, userEvent, args, step }) => {
    await step("Open then cancel", async () => {
      await userEvent.click(canvas.getByLabelText("Create project"));
      await expect(canvas.getByLabelText("Project name")).toBeInTheDocument();
      await userEvent.click(canvas.getByText("Cancel"));
    });

    // Form should be gone
    await waitFor(() => {
      expect(canvas.queryByLabelText("Project name")).not.toBeInTheDocument();
    });

    // onCreateProject should not have been called
    expect(args.onCreateProject).not.toHaveBeenCalled();
  },
};
