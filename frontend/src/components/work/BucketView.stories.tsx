import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { BucketView } from "./BucketView";
import type {
  Thing,
  ThingBucket,
  Project,
  ReferenceMaterial,
} from "@/model/types";
import {
  createThing,
  createProject,
  createReferenceMaterial,
  resetFactoryCounter,
} from "@/model/factories";
import type { CanonicalId } from "@/model/canonical-id";

resetFactoryCounter();

const sampleProjects = [
  createProject({ name: "Website Redesign", desiredOutcome: "New site live" }),
  createProject({ name: "Q1 Planning", desiredOutcome: "Q1 goals defined" }),
];

const sampleThings: Thing[] = [
  createThing({ rawCapture: "Buy groceries for the week", bucket: "inbox" }),
  createThing({
    rawCapture: "Call client about Q1 proposal",
    bucket: "inbox",
  }),
  createThing({
    rawCapture: "Draft project brief for redesign",
    bucket: "inbox",
  }),
  createThing({
    rawCapture: "Review team performance reports",
    bucket: "next",
    isFocused: true,
  }),
  createThing({
    rawCapture: "Submit expense report",
    bucket: "next",
    dueDate: "2026-02-14",
  }),
  createThing({ rawCapture: "Follow up with vendor", bucket: "waiting" }),
  createThing({ rawCapture: "Plan team offsite", bucket: "someday" }),
  createThing({
    rawCapture: "Quarterly review meeting",
    bucket: "calendar",
    dueDate: "2026-03-01",
  }),
  // Project-linked actions
  createThing({
    rawCapture: "Finalize brand guidelines",
    bucket: "next",
    projectId: sampleProjects[0].id,
    sequenceOrder: 1,
    completedAt: "2026-01-20T10:00:00Z",
  }),
  createThing({
    rawCapture: "Design homepage wireframes",
    bucket: "next",
    projectId: sampleProjects[0].id,
    sequenceOrder: 2,
  }),
  createThing({
    rawCapture: "Implement responsive layout",
    bucket: "next",
    projectId: sampleProjects[0].id,
    sequenceOrder: 3,
  }),
  createThing({
    rawCapture: "Define Q1 OKRs",
    bucket: "next",
    projectId: sampleProjects[1].id,
    sequenceOrder: 1,
  }),
];

const sampleRefs: ReferenceMaterial[] = [
  createReferenceMaterial({
    name: "Company style guide",
    origin: "captured",
    encodingFormat: "application/pdf",
  }),
  createReferenceMaterial({
    name: "Meeting notes from standup",
    origin: "triaged",
    description: "Key decisions captured.",
  }),
  createReferenceMaterial({
    name: "Invoice Q4-2025.pdf",
    origin: "file",
    encodingFormat: "application/pdf",
  }),
];

// ---------------------------------------------------------------------------
// Stateful wrapper for interactive stories
// ---------------------------------------------------------------------------

function StatefulBucketView({
  initialThings = [],
  initialRefs = [],
  initialBucket = "inbox",
  projects = [],
}: {
  initialThings?: Thing[];
  initialRefs?: ReferenceMaterial[];
  initialBucket?: string;
  projects?: Project[];
}) {
  const [things, setThings] = useState<Thing[]>(initialThings);
  const [refs, setRefs] = useState<ReferenceMaterial[]>(initialRefs);
  const [bucket, setBucket] = useState<string>(initialBucket);

  return (
    <BucketView
      activeBucket={bucket as ThingBucket}
      onBucketChange={(b) => setBucket(b)}
      things={things}
      referenceItems={refs}
      projects={projects}
      onAddThing={(title, bucket) => {
        setThings((prev) => [...prev, createThing({ rawCapture: title, bucket })]);
      }}
      onCompleteThing={(id) => {
        setThings((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, completedAt: new Date().toISOString() } : t,
          ),
        );
      }}
      onToggleFocus={(id) => {
        setThings((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, isFocused: !t.isFocused } : t,
          ),
        );
      }}
      onMoveThing={(id, bucket) => {
        setThings((prev) =>
          prev.map((t) => (t.id === id ? { ...t, bucket } : t)),
        );
      }}
      onArchiveThing={(id) => {
        setThings((prev) => prev.filter((t) => t.id !== id));
      }}
      onAddReference={(title) => {
        setRefs((prev) => [
          ...prev,
          createReferenceMaterial({ name: title, origin: "captured" }),
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
      onAddProjectAction={(projectId: CanonicalId, title: string) => {
        setThings((prev) => [
          ...prev,
          createThing({ rawCapture: title, bucket: "next", projectId }),
        ]);
      }}
      onUpdateTitle={(id, newTitle) => {
        setThings((prev) =>
          prev.map((t) => (t.id === id ? { ...t, name: newTitle } : t)),
        );
      }}
      onEditThing={(id, fields) => {
        setThings((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...fields } : t)),
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: "Work/BucketView",
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
      initialThings={[...sampleThings]}
      initialRefs={[...sampleRefs]}
      projects={sampleProjects}
    />
  ),
};

export const EmptyInbox: Story = {
  render: () => (
    <StatefulBucketView
      initialThings={sampleThings.filter((t) => t.bucket !== "inbox")}
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
      initialThings={[...sampleThings]}
      initialRefs={[...sampleRefs]}
      projects={sampleProjects}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "Buckets" });
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

/** Move an inbox item to Next, then verify it shows in Next Actions. */
export const InboxToNext: Story = {
  render: () => (
    <StatefulBucketView
      initialThings={[
        createThing({
          rawCapture: "Write quarterly report",
          bucket: "inbox",
        }),
      ]}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "Buckets" });
    const sidebar = within(nav);

    await expect(canvas.getByText(/1 item to process/)).toBeInTheDocument();

    await step("Expand item and move to Next", async () => {
      await userEvent.click(
        canvas.getByLabelText("Edit Write quarterly report"),
      );
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
      initialThings={[
        createThing({ rawCapture: "Task to complete", bucket: "next" }),
        createThing({ rawCapture: "Task to keep", bucket: "next" }),
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
      initialThings={[
        createThing({ rawCapture: "Important task", bucket: "next" }),
        createThing({ rawCapture: "Regular task", bucket: "next" }),
      ]}
      initialBucket="next"
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "Buckets" });
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

/** Drag a thing's handle to a sidebar bucket to move it. Manual interaction only. */
export const DragToSomeday: Story = {
  render: () => (
    <StatefulBucketView
      initialThings={[
        createThing({ rawCapture: "Drag me to Someday", bucket: "next" }),
        createThing({ rawCapture: "Stay in Next", bucket: "next" }),
      ]}
      initialBucket="next"
    />
  ),
};

/** Drag an inbox thing to a sidebar bucket to move it. Manual interaction only. */
export const DragInboxToBucket: Story = {
  render: () => (
    <StatefulBucketView
      initialThings={[
        createThing({
          rawCapture: "Drag me to Next Actions",
          bucket: "inbox",
        }),
        createThing({
          rawCapture: "Drag me to Someday",
          bucket: "inbox",
        }),
      ]}
    />
  ),
};

/** Full workflow: capture → move to Next → focus → complete. */
export const FullWorkflow: Story = {
  render: () => <StatefulBucketView />,
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "Buckets" });
    const sidebar = within(nav);

    await step("Capture a todo", async () => {
      const input = canvas.getByLabelText("Capture a thought");
      await userEvent.type(input, "Prepare team presentation{Enter}");
      await expect(
        canvas.getByText("Prepare team presentation"),
      ).toBeInTheDocument();
      await expect(canvas.getByText(/1 item to process/)).toBeInTheDocument();
    });

    await step("Expand item and move to Next", async () => {
      await userEvent.click(
        canvas.getByLabelText("Edit Prepare team presentation"),
      );
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
      initialThings={[...sampleThings]}
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
