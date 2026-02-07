import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { BucketView } from "./BucketView";
import type {
  InboxItem,
  Action,
  Project,
  ReferenceMaterial,
} from "@/model/gtd-types";
import {
  createInboxItem,
  createAction,
  createProject,
  createReferenceMaterial,
  resetFactoryCounter,
} from "@/model/factories";

resetFactoryCounter();

const sampleProjects = [
  createProject({ title: "Website Redesign", desiredOutcome: "New site live" }),
  createProject({ title: "Q1 Planning", desiredOutcome: "Q1 goals defined" }),
];

const sampleInboxItems = [
  createInboxItem({ title: "Buy groceries for the week" }),
  createInboxItem({ title: "Call client about Q1 proposal" }),
  createInboxItem({ title: "Draft project brief for redesign" }),
];

const sampleActions: Action[] = [
  createAction({
    title: "Review team performance reports",
    bucket: "next",
    isFocused: true,
  }),
  createAction({
    title: "Submit expense report",
    bucket: "next",
    dueDate: "2026-02-14",
  }),
  createAction({ title: "Follow up with vendor", bucket: "waiting" }),
  createAction({ title: "Plan team offsite", bucket: "someday" }),
  createAction({
    title: "Quarterly review meeting",
    bucket: "calendar",
    dueDate: "2026-03-01",
  }),
  // Project-linked actions
  createAction({
    title: "Finalize brand guidelines",
    bucket: "next",
    projectId: sampleProjects[0].id,
    sequenceOrder: 1,
    completedAt: "2026-01-20T10:00:00Z",
  }),
  createAction({
    title: "Design homepage wireframes",
    bucket: "next",
    projectId: sampleProjects[0].id,
    sequenceOrder: 2,
  }),
  createAction({
    title: "Implement responsive layout",
    bucket: "next",
    projectId: sampleProjects[0].id,
    sequenceOrder: 3,
  }),
  createAction({
    title: "Define Q1 OKRs",
    bucket: "next",
    projectId: sampleProjects[1].id,
    sequenceOrder: 1,
  }),
];

const sampleRefs: ReferenceMaterial[] = [
  createReferenceMaterial({
    title: "Company style guide",
    origin: "captured",
    contentType: "application/pdf",
  }),
  createReferenceMaterial({
    title: "Meeting notes from standup",
    origin: "triaged",
    notes: "Key decisions captured.",
  }),
  createReferenceMaterial({
    title: "Invoice Q4-2025.pdf",
    origin: "file",
    contentType: "application/pdf",
  }),
];

// ---------------------------------------------------------------------------
// Stateful wrapper for interactive stories
// ---------------------------------------------------------------------------

function StatefulBucketView({
  initialInboxItems = [],
  initialActions = [],
  initialRefs = [],
  initialBucket,
  projects = [],
}: {
  initialInboxItems?: InboxItem[];
  initialActions?: Action[];
  initialRefs?: ReferenceMaterial[];
  initialBucket?: string;
  projects?: Project[];
}) {
  const [inboxItems, setInboxItems] = useState<InboxItem[]>(initialInboxItems);
  const [actions, setActions] = useState<Action[]>(initialActions);
  const [refs, setRefs] = useState<ReferenceMaterial[]>(initialRefs);

  return (
    <BucketView
      initialBucket={(initialBucket as Action["bucket"]) ?? "inbox"}
      inboxItems={inboxItems}
      actions={actions}
      referenceItems={refs}
      projects={projects}
      onCaptureInbox={(text) => {
        setInboxItems((prev) => [...prev, createInboxItem({ title: text })]);
      }}
      onTriageInbox={(item, result) => {
        setInboxItems((prev) => prev.filter((i) => i.id !== item.id));
        if (result.targetBucket === "reference") {
          setRefs((prev) => [
            ...prev,
            createReferenceMaterial({ title: item.title, origin: "triaged" }),
          ]);
        } else if (result.targetBucket !== "archive") {
          setActions((prev) => [
            ...prev,
            createAction({
              title: item.title,
              bucket: result.targetBucket as Action["bucket"],
              dueDate: result.date,
            }),
          ]);
        }
      }}
      onAddAction={(title, bucket) => {
        setActions((prev) => [...prev, createAction({ title, bucket })]);
      }}
      onCompleteAction={(id) => {
        setActions((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, completedAt: new Date().toISOString() } : a,
          ),
        );
      }}
      onToggleFocus={(id) => {
        setActions((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, isFocused: !a.isFocused } : a,
          ),
        );
      }}
      onMoveAction={(id, bucket) => {
        setActions((prev) =>
          prev.map((a) => (a.id === id ? { ...a, bucket } : a)),
        );
      }}
      onAddReference={(title) => {
        setRefs((prev) => [
          ...prev,
          createReferenceMaterial({ title, origin: "captured" }),
        ]);
      }}
      onArchiveReference={(id) => {
        setRefs((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  provenance: {
                    ...r.provenance,
                    archivedAt: new Date().toISOString(),
                  },
                }
              : r,
          ),
        );
      }}
      onAddProjectAction={(projectId, title) => {
        setActions((prev) => [
          ...prev,
          createAction({ title, bucket: "next", projectId }),
        ]);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: "GTD/BucketView",
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="p-4" style={{ minHeight: 500 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Render-only stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  render: () => (
    <StatefulBucketView
      initialInboxItems={[...sampleInboxItems]}
      initialActions={[...sampleActions]}
      initialRefs={[...sampleRefs]}
      projects={sampleProjects}
    />
  ),
};

export const EmptyInbox: Story = {
  render: () => (
    <StatefulBucketView
      initialActions={[...sampleActions]}
      initialRefs={[...sampleRefs]}
    />
  ),
};

export const ReferenceView: Story = {
  render: () => (
    <StatefulBucketView
      initialRefs={[...sampleRefs]}
      initialBucket="reference"
    />
  ),
};

// ---------------------------------------------------------------------------
// Interactive stories with play functions
// ---------------------------------------------------------------------------

/** Click sidebar items to switch between buckets. */
export const NavigateBuckets: Story = {
  render: () => (
    <StatefulBucketView
      initialInboxItems={[...sampleInboxItems]}
      initialActions={[...sampleActions]}
      initialRefs={[...sampleRefs]}
      projects={sampleProjects}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "GTD buckets" });
    const sidebar = within(nav);

    await expect(canvas.getByText(/3 items to process/)).toBeInTheDocument();

    await step("Navigate to Next Actions", async () => {
      await userEvent.click(sidebar.getByText("Next Actions"));
      await expect(
        canvas.getByRole("heading", { name: /Next Actions/ }),
      ).toBeInTheDocument();
      await expect(
        canvas.getByText("Review team performance reports"),
      ).toBeInTheDocument();
    });

    await step("Navigate to Waiting For", async () => {
      await userEvent.click(sidebar.getByText("Waiting For"));
      await expect(
        canvas.getByRole("heading", { name: /Waiting For/ }),
      ).toBeInTheDocument();
      await expect(
        canvas.getByText("Follow up with vendor"),
      ).toBeInTheDocument();
    });

    await step("Navigate to Focus", async () => {
      await userEvent.click(sidebar.getByText("Focus"));
      await expect(
        canvas.getByRole("heading", { name: /Focus/ }),
      ).toBeInTheDocument();
      await expect(
        canvas.getByText("Review team performance reports"),
      ).toBeInTheDocument();
    });

    await step("Navigate to Someday/Maybe", async () => {
      await userEvent.click(sidebar.getByText("Someday/Maybe"));
      await expect(canvas.getByText("Plan team offsite")).toBeInTheDocument();
    });

    await step("Navigate back to Inbox", async () => {
      await userEvent.click(sidebar.getByText("Inbox"));
      await expect(canvas.getByText(/3 items to process/)).toBeInTheDocument();
    });
  },
};

/** Triage an inbox item to Next, then verify it shows in Next Actions. */
export const InboxToNext: Story = {
  render: () => (
    <StatefulBucketView
      initialInboxItems={[createInboxItem({ title: "Write quarterly report" })]}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "GTD buckets" });
    const sidebar = within(nav);

    await expect(canvas.getByText(/1 item to process/)).toBeInTheDocument();

    await step("Triage to Next", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Next"));
    });

    await expect(canvas.getByText("Inbox is empty")).toBeInTheDocument();

    await step("Navigate to Next Actions", async () => {
      await userEvent.click(sidebar.getByText("Next Actions"));
      await expect(
        canvas.getByText("Write quarterly report"),
      ).toBeInTheDocument();
      await expect(canvas.getByText("1 action")).toBeInTheDocument();
    });
  },
};

/** Complete an action from the Next Actions view — count decreases. */
export const CompleteFromNext: Story = {
  render: () => (
    <StatefulBucketView
      initialActions={[
        createAction({ title: "Task to complete", bucket: "next" }),
        createAction({ title: "Task to keep", bucket: "next" }),
      ]}
      initialBucket="next"
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await expect(canvas.getByText("2 actions")).toBeInTheDocument();

    await step("Complete first action", async () => {
      await userEvent.click(canvas.getByLabelText("Complete Task to complete"));
    });

    await expect(canvas.getByText("1 action")).toBeInTheDocument();
    await expect(
      canvas.queryByText("Task to complete"),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Task to keep")).toBeInTheDocument();
  },
};

/** Star an action in Next, then verify it appears in Focus view. */
export const FocusStar: Story = {
  render: () => (
    <StatefulBucketView
      initialActions={[
        createAction({ title: "Important task", bucket: "next" }),
        createAction({ title: "Regular task", bucket: "next" }),
      ]}
      initialBucket="next"
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "GTD buckets" });
    const sidebar = within(nav);

    await step("Star the first action", async () => {
      await userEvent.click(canvas.getByLabelText("Focus Important task"));
    });

    await step("Navigate to Focus view", async () => {
      await userEvent.click(sidebar.getByText("Focus"));
      await expect(
        canvas.getByRole("heading", { name: /Focus/ }),
      ).toBeInTheDocument();
      await expect(canvas.getByText("Important task")).toBeInTheDocument();
      await expect(canvas.queryByText("Regular task")).not.toBeInTheDocument();
      await expect(canvas.getByText("1 action")).toBeInTheDocument();
    });
  },
};

/** Drag an action's handle to a sidebar bucket to move it. Manual interaction only. */
export const DragToSomeday: Story = {
  render: () => (
    <StatefulBucketView
      initialActions={[
        createAction({ title: "Drag me to Someday", bucket: "next" }),
        createAction({ title: "Stay in Next", bucket: "next" }),
      ]}
      initialBucket="next"
    />
  ),
};

/** Full workflow: capture → triage → focus → complete. */
export const FullWorkflow: Story = {
  render: () => <StatefulBucketView />,
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "GTD buckets" });
    const sidebar = within(nav);

    await step("Capture a todo", async () => {
      const input = canvas.getByLabelText("Capture inbox item");
      await userEvent.type(input, "Prepare team presentation{Enter}");
      await expect(
        canvas.getByText("Prepare team presentation"),
      ).toBeInTheDocument();
      await expect(canvas.getByText(/1 item to process/)).toBeInTheDocument();
    });

    await step("Triage to Next", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Next"));
      await expect(canvas.getByText("Inbox is empty")).toBeInTheDocument();
    });

    await step("Navigate to Next and star the action", async () => {
      await userEvent.click(sidebar.getByText("Next Actions"));
      await expect(
        canvas.getByText("Prepare team presentation"),
      ).toBeInTheDocument();
      await userEvent.click(
        canvas.getByLabelText("Focus Prepare team presentation"),
      );
    });

    await step("Verify it appears in Focus view", async () => {
      await userEvent.click(sidebar.getByText("Focus"));
      await expect(
        canvas.getByText("Prepare team presentation"),
      ).toBeInTheDocument();
    });

    await step("Complete the action from Focus view", async () => {
      await userEvent.click(
        canvas.getByLabelText("Complete Prepare team presentation"),
      );
      await expect(canvas.getByText("No focused actions")).toBeInTheDocument();
    });

    await step("Verify Next is also empty", async () => {
      await userEvent.click(sidebar.getByText("Next Actions"));
      await expect(canvas.getByText("No actions here yet")).toBeInTheDocument();
    });
  },
};

/** Navigate to Projects and expand a project to see sequential actions. */
export const ProjectsView: Story = {
  render: () => (
    <StatefulBucketView
      initialActions={[...sampleActions]}
      initialRefs={[...sampleRefs]}
      projects={sampleProjects}
      initialBucket="project"
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await expect(
      canvas.getByRole("heading", { name: /Projects/ }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("2 projects")).toBeInTheDocument();

    await step("Expand Website Redesign project", async () => {
      await userEvent.click(canvas.getByText("Website Redesign"));
      await expect(
        canvas.getByText("Design homepage wireframes"),
      ).toBeInTheDocument();
    });
  },
};
