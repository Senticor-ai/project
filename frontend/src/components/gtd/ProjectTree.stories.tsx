import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ProjectTree } from "./ProjectTree";
import type { Action, Project } from "@/model/gtd-types";
import {
  createAction,
  createProject,
  resetFactoryCounter,
} from "@/model/factories";

resetFactoryCounter();

const project1 = createProject({
  title: "Website Redesign",
  desiredOutcome: "New site live and indexed by Google",
  status: "active",
});

const project2 = createProject({
  title: "Mobile App Launch",
  desiredOutcome: "App in both stores with 4+ star rating",
  status: "active",
});

const project3 = createProject({
  title: "Internal Tool Migration",
  desiredOutcome: "Legacy tool fully replaced",
  status: "completed",
});

const sampleActions: Action[] = [
  createAction({
    title: "Finalize brand guidelines",
    projectId: project1.id,
    sequenceOrder: 1,
    completedAt: "2026-01-15T10:00:00Z",
  }),
  createAction({
    title: "Design homepage wireframes",
    projectId: project1.id,
    sequenceOrder: 2,
  }),
  createAction({
    title: "Implement responsive layout",
    projectId: project1.id,
    sequenceOrder: 3,
  }),
  createAction({
    title: "Write copy for landing page",
    projectId: project1.id,
    sequenceOrder: 4,
  }),
  createAction({
    title: "Set up CI/CD pipeline",
    projectId: project2.id,
    sequenceOrder: 1,
    isFocused: true,
  }),
  createAction({
    title: "Implement push notifications",
    projectId: project2.id,
    sequenceOrder: 2,
  }),
];

const sampleProjects: Project[] = [project1, project2, project3];

const meta = {
  title: "GTD/ProjectTree",
  component: ProjectTree,
  tags: ["autodocs"],
  args: {
    onCompleteAction: fn(),
    onToggleFocus: fn(),
    onAddAction: fn(),
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
    actions: sampleActions.filter((a) => a.projectId === project1.id),
  },
};

export const EmptyProject: Story = {
  args: {
    projects: [
      createProject({
        title: "Stalled Project",
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

export const ExpandCollapse: Story = {
  args: {
    projects: sampleProjects,
    actions: sampleActions,
  },
  play: async ({ canvas, userEvent }) => {
    // Expand first project
    const projectBtn = canvas.getByText("Website Redesign");
    await userEvent.click(projectBtn);

    // Verify action is visible
    expect(canvas.getByText("Design homepage wireframes")).toBeTruthy();

    // Expand second project (first should collapse)
    await userEvent.click(canvas.getByText("Mobile App Launch"));
    expect(canvas.getByText("Set up CI/CD pipeline")).toBeTruthy();
  },
};

export const SequentialActions: Story = {
  args: {
    projects: [project1],
    actions: sampleActions.filter((a) => a.projectId === project1.id),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Website Redesign"));

    // Verify completed, next, and future actions are all visible
    expect(canvas.getByText("Finalize brand guidelines")).toBeTruthy();
    expect(canvas.getByText("Design homepage wireframes")).toBeTruthy();
    expect(canvas.getByText("Implement responsive layout")).toBeTruthy();
  },
};
