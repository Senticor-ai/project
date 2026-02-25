import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { BucketView } from "./BucketView";
import type {
  ActionItem,
  ActionItemBucket,
  Project,
  ReferenceMaterial,
} from "@/model/types";
import {
  createActionItem,
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

const sampleItems: ActionItem[] = [
  createActionItem({
    rawCapture: "Buy groceries for the week",
    bucket: "inbox",
  }),
  createActionItem({
    rawCapture: "Call client about Q1 proposal",
    bucket: "inbox",
  }),
  createActionItem({
    rawCapture: "Draft project brief for redesign",
    bucket: "inbox",
  }),
  createActionItem({
    rawCapture: "Review team performance reports",
    bucket: "next",
    isFocused: true,
  }),
  createActionItem({
    rawCapture: "Submit expense report",
    bucket: "next",
    dueDate: "2026-02-14",
  }),
  createActionItem({ rawCapture: "Follow up with vendor", bucket: "waiting" }),
  createActionItem({ rawCapture: "Plan team offsite", bucket: "someday" }),
  createActionItem({
    rawCapture: "Quarterly review meeting",
    bucket: "calendar",
    dueDate: "2026-03-01",
  }),
  // Project-linked actions
  createActionItem({
    rawCapture: "Finalize brand guidelines",
    bucket: "next",
    projectId: sampleProjects[0]!.id,
    sequenceOrder: 1,
    completedAt: "2026-01-20T10:00:00Z",
  }),
  createActionItem({
    rawCapture: "Design homepage wireframes",
    bucket: "next",
    projectId: sampleProjects[0]!.id,
    sequenceOrder: 2,
  }),
  createActionItem({
    rawCapture: "Implement responsive layout",
    bucket: "next",
    projectId: sampleProjects[0]!.id,
    sequenceOrder: 3,
  }),
  createActionItem({
    rawCapture: "Define Q1 OKRs",
    bucket: "next",
    projectId: sampleProjects[1]!.id,
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
  initialItems = [],
  initialRefs = [],
  initialBucket = "inbox",
  projects = [],
}: {
  initialItems?: ActionItem[];
  initialRefs?: ReferenceMaterial[];
  initialBucket?: string;
  projects?: Project[];
}) {
  const [items, setItems] = useState<ActionItem[]>(initialItems);
  const [refs, setRefs] = useState<ReferenceMaterial[]>(initialRefs);
  const [bucket, setBucket] = useState<string>(initialBucket);

  return (
    <BucketView
      activeBucket={bucket as ActionItemBucket}
      onBucketChange={(b) => setBucket(b)}
      actionItems={items}
      referenceItems={refs}
      projects={projects}
      onAddActionItem={(title, bucket) => {
        setItems((prev) => [
          ...prev,
          createActionItem({ rawCapture: title, bucket }),
        ]);
      }}
      onCompleteActionItem={(id) => {
        // In production, completing removes from the active query results
        setItems((prev) => prev.filter((t) => t.id !== id));
      }}
      onToggleFocus={(id) => {
        setItems((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, isFocused: !t.isFocused } : t,
          ),
        );
      }}
      onMoveActionItem={(id, bucket) => {
        setItems((prev) =>
          prev.map((t) => (t.id === id ? ({ ...t, bucket } as ActionItem) : t)),
        );
      }}
      onArchiveActionItem={(id) => {
        setItems((prev) => prev.filter((t) => t.id !== id));
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
        setItems((prev) => [
          ...prev,
          createActionItem({ rawCapture: title, bucket: "next", projectId }),
        ]);
      }}
      onUpdateTitle={(id, newTitle) => {
        setItems((prev) =>
          prev.map((t) => (t.id === id ? { ...t, name: newTitle } : t)),
        );
      }}
      onEditActionItem={(id, fields) => {
        setItems((prev) =>
          prev.map((t) =>
            t.id === id ? ({ ...t, ...fields } as ActionItem) : t,
          ),
        );
      }}
      onSetType={(id, type) => {
        setItems((prev) =>
          prev.map((t) =>
            t.id === id
              ? ({
                  ...t,
                  schemaType: type === "Action" ? undefined : type,
                } as ActionItem)
              : t,
          ),
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
      initialItems={[...sampleItems]}
      initialRefs={[...sampleRefs]}
      projects={sampleProjects}
    />
  ),
};

export const EmptyInbox: Story = {
  render: () => (
    <StatefulBucketView
      initialItems={sampleItems.filter((t) => t.bucket !== "inbox")}
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
      initialItems={[...sampleItems]}
      initialRefs={[...sampleRefs]}
      projects={sampleProjects}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    const nav = canvas.getByRole("navigation", { name: "Buckets" });
    const sidebar = within(nav);

    await expect(canvas.getByText(/3 items to process/)).toBeInTheDocument();

    await step("Navigate to Next", async () => {
      await userEvent.click(sidebar.getByText("Next"));
      await expect(
        canvas.getByRole("heading", { name: /Next/ }),
      ).toBeInTheDocument();
      await expect(
        canvas.getByText("Review team performance reports"),
      ).toBeInTheDocument();
    });

    await step("Navigate to Waiting", async () => {
      await userEvent.click(sidebar.getByText("Waiting"));
      await expect(
        canvas.getByRole("heading", { name: /Waiting/ }),
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

    await step("Navigate to Later", async () => {
      await userEvent.click(sidebar.getByText("Later"));
      await expect(canvas.getByText("Plan team offsite")).toBeInTheDocument();
    });

    await step("Navigate back to Inbox", async () => {
      await userEvent.click(sidebar.getByText("Inbox"));
      await expect(canvas.getByText(/3 items to process/)).toBeInTheDocument();
    });
  },
};

/** Move an inbox item to Next, then verify it shows in Next. */
export const InboxToNext: Story = {
  render: () => (
    <StatefulBucketView
      initialItems={[
        createActionItem({
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

    await step("Click item to expand triage buttons", async () => {
      await userEvent.click(canvas.getByText("Write quarterly report"));
    });

    await step("Move to Next", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Next"));
    });

    await expect(canvas.getByText("Inbox is empty")).toBeInTheDocument();

    await step("Navigate to Next", async () => {
      await userEvent.click(sidebar.getByText("Next"));
      await expect(
        canvas.getByText("Write quarterly report"),
      ).toBeInTheDocument();
      await expect(canvas.getByText("1 action")).toBeInTheDocument();
    });
  },
};

/** Complete an action from the Next view — count decreases. */
export const CompleteFromNext: Story = {
  render: () => (
    <StatefulBucketView
      initialItems={[
        createActionItem({ rawCapture: "Task to complete", bucket: "next" }),
        createActionItem({ rawCapture: "Task to keep", bucket: "next" }),
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
      initialItems={[
        createActionItem({ rawCapture: "Important task", bucket: "next" }),
        createActionItem({ rawCapture: "Regular task", bucket: "next" }),
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

/** Drag an item's handle to a sidebar bucket to move it. Manual interaction only. */
export const DragToSomeday: Story = {
  render: () => (
    <StatefulBucketView
      initialItems={[
        createActionItem({ rawCapture: "Drag me to Later", bucket: "next" }),
        createActionItem({ rawCapture: "Scopilot in Next", bucket: "next" }),
      ]}
      initialBucket="next"
    />
  ),
};

/** Drag an inbox item to a sidebar bucket to move it. Manual interaction only. */
export const DragInboxToBucket: Story = {
  render: () => (
    <StatefulBucketView
      initialItems={[
        createActionItem({
          rawCapture: "Drag me to Next",
          bucket: "inbox",
        }),
        createActionItem({
          rawCapture: "Drag me to Later",
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

    await step("Click item and move to Next", async () => {
      await userEvent.click(canvas.getByText("Prepare team presentation"));
      await userEvent.click(canvas.getByLabelText("Move to Next"));
      await expect(canvas.getByText("Inbox is empty")).toBeInTheDocument();
    });

    await step("Navigate to Next and star the action", async () => {
      await userEvent.click(sidebar.getByText("Next"));
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
      await userEvent.click(sidebar.getByText("Next"));
      await expect(canvas.getByText("No actions here yet")).toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// Responsive viewport stories
// ---------------------------------------------------------------------------

/** Mobile viewport — sidebar is hidden via `hidden md:block`. */
export const MobileLayout: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <StatefulBucketView
      initialItems={[...sampleItems]}
      initialRefs={[...sampleRefs]}
      projects={sampleProjects}
    />
  ),
  play: async ({ canvas, step }) => {
    await step("Sidebar is hidden on mobile", async () => {
      const nav = canvas.queryByRole("navigation", { name: "Buckets" });
      if (nav) {
        await expect(nav).not.toBeVisible();
      }
    });

    await step("Content area is visible", async () => {
      await expect(canvas.getByLabelText("Bucket content")).toBeInTheDocument();
    });
  },
};

/** Tablet viewport — sidebar + content fit side by side. */
export const TabletLayout: Story = {
  globals: { viewport: { value: "tablet", isRotated: false } },
  render: () => (
    <StatefulBucketView
      initialItems={[...sampleItems]}
      initialRefs={[...sampleRefs]}
      projects={sampleProjects}
    />
  ),
  play: async ({ canvas, step }) => {
    await step("Sidebar is visible on tablet", async () => {
      await expect(
        canvas.getByRole("navigation", { name: "Buckets" }),
      ).toBeVisible();
    });
  },
};

/** Navigate to Projects and expand a project to see sequential actions. */
export const ProjectsView: Story = {
  render: () => (
    <StatefulBucketView
      initialItems={[...sampleItems]}
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

/** Inbox with mixed schema.org subtypes — shows type filter chips and filters on click. */
export const WithSubtypeFilter: Story = {
  render: () => (
    <StatefulBucketView
      initialBucket="inbox"
      initialItems={[
        createActionItem({
          name: "Äpfel kaufen",
          bucket: "inbox",
          schemaType: "BuyAction",
        }),
        createActionItem({
          name: "Blumen kaufen",
          bucket: "inbox",
          schemaType: "BuyAction",
        }),
        createActionItem({
          name: "Urlaub planen",
          bucket: "inbox",
          schemaType: "PlanAction",
        }),
        createActionItem({
          name: "Bericht prüfen",
          bucket: "inbox",
          schemaType: "ReviewAction",
        }),
        createActionItem({ name: "Allgemeiner Posteingang", bucket: "inbox" }),
      ]}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await step("Type filter chips are visible", async () => {
      await expect(
        canvas.getByRole("button", { name: /Filter by type: Kaufen/i }),
      ).toBeInTheDocument();
      await expect(
        canvas.getByRole("button", { name: /Filter by type: Planen/i }),
      ).toBeInTheDocument();
    });

    await step("Click 'Kaufen' chip to filter", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: /Filter by type: Kaufen/i }),
      );
      await expect(canvas.getByText("Äpfel kaufen")).toBeInTheDocument();
      await expect(canvas.getByText("Blumen kaufen")).toBeInTheDocument();
      // Non-BuyAction items should be hidden
      const allgemein = canvas.queryByText("Allgemeiner Posteingang");
      await expect(allgemein).not.toBeInTheDocument();
    });

    await step("Click chip again to clear filter", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: /Filter by type: Kaufen/i }),
      );
      await expect(
        canvas.getByText("Allgemeiner Posteingang"),
      ).toBeInTheDocument();
    });
  },
};
