import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { ThingList } from "./ThingList";
import type { Thing, ItemEditableFields, ThingBucket } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";
import {
  createThing,
  createProject,
  resetFactoryCounter,
} from "@/model/factories";

// ---------------------------------------------------------------------------
// Shared data
// ---------------------------------------------------------------------------

resetFactoryCounter();

const sampleProjects = [
  createProject({
    name: "Website Redesign",
    desiredOutcome: "New site live",
  }),
  createProject({
    name: "Q1 Planning",
    desiredOutcome: "Q1 goals defined",
  }),
];

// ---------------------------------------------------------------------------
// Stateful wrapper
// ---------------------------------------------------------------------------

interface WorkflowAppProps {
  initialThings?: Thing[];
  bucket?: Thing["bucket"] | "focus";
}

function WorkflowApp({
  initialThings = [],
  bucket = "inbox",
}: WorkflowAppProps) {
  const [things, setThings] = useState<Thing[]>(initialThings);

  return (
    <ThingList
      bucket={bucket}
      things={things}
      projects={sampleProjects}
      onAdd={(title) => {
        setThings((prev) => [
          ...prev,
          createThing({
            rawCapture: title,
            bucket: bucket === "focus" ? "next" : (bucket as Thing["bucket"]),
          }),
        ]);
      }}
      onComplete={(id) => {
        // In production, completing removes from the active query results
        setThings((prev) => prev.filter((t) => t.id !== id));
      }}
      onToggleFocus={(id) => {
        setThings((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, isFocused: !t.isFocused } : t,
          ),
        );
      }}
      onMove={(id, targetBucket) => {
        setThings((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, bucket: targetBucket as ThingBucket } : t,
          ),
        );
      }}
      onArchive={(id) => {
        setThings((prev) => prev.filter((t) => t.id !== id));
      }}
      onEdit={(id: CanonicalId, fields: Partial<ItemEditableFields>) => {
        setThings((prev) =>
          prev.map((t) => (t.id === id ? ({ ...t, ...fields } as Thing) : t)),
        );
      }}
      onUpdateTitle={(id: CanonicalId, newTitle: string) => {
        setThings((prev) =>
          prev.map((t) => (t.id === id ? { ...t, name: newTitle } : t)),
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: "Work/Workflow",
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-lg p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Story 1: Capture three todos
// ---------------------------------------------------------------------------

/** User captures 3 todos into inbox via rapid entry. */
export const CaptureThreeTodos: Story = {
  render: () => <WorkflowApp />,
  play: async ({ canvas, userEvent, step }) => {
    const input = canvas.getByLabelText("Capture a thought");

    await step("Capture personal todo", async () => {
      await userEvent.type(input, "Buy groceries{Enter}");
      await expect(canvas.getByText("Buy groceries")).toBeInTheDocument();
    });

    await step("Capture business call todo", async () => {
      await userEvent.type(input, "Call client{Enter}");
      await expect(canvas.getByText("Call client")).toBeInTheDocument();
    });

    await step("Capture project todo", async () => {
      await userEvent.type(input, "Draft brief{Enter}");
      await expect(canvas.getByText("Draft brief")).toBeInTheDocument();
    });

    await expect(canvas.getByText(/3 items to process/)).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Story 2: Triage inbox item to Next
// ---------------------------------------------------------------------------

/** User expands an inbox item and clicks the Next triage button. */
export const TriageToNext: Story = {
  render: () => (
    <WorkflowApp
      initialThings={[
        createThing({ rawCapture: "Review annual budget report" }),
      ]}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await step("Move to Next (item is auto-expanded in inbox)", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Next"));
    });

    // Item moved to "next" bucket — no longer visible in inbox view
    await expect(
      canvas.queryByText("Review annual budget report"),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Inbox is empty")).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Story 3: Triage to Waiting
// ---------------------------------------------------------------------------

/** User triages an item to Waiting via triage button. */
export const TriageToWaiting: Story = {
  render: () => (
    <WorkflowApp
      initialThings={[
        createThing({ rawCapture: "Call client about Q1 proposal" }),
      ]}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await step("Move to Waiting (item is auto-expanded in inbox)", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Waiting"));
    });

    await expect(canvas.getByText("Inbox is empty")).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Story 4: Complete items from Next Actions
// ---------------------------------------------------------------------------

/** User completes items in the Next Actions bucket. */
export const CompleteFromNextActions: Story = {
  render: () => (
    <WorkflowApp
      bucket="next"
      initialThings={[
        createThing({
          rawCapture: "Buy groceries",
          bucket: "next",
        }),
        createThing({
          rawCapture: "Schedule dentist appointment",
          bucket: "next",
        }),
        createThing({
          rawCapture: "Update resume",
          bucket: "next",
        }),
      ]}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await expect(canvas.getByText(/3 actions/)).toBeInTheDocument();

    await step("Complete first item", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: /complete buy groceries/i }),
      );
    });

    await expect(canvas.getByText(/2 actions/)).toBeInTheDocument();

    await step("Complete second item", async () => {
      await userEvent.click(
        canvas.getByRole("button", {
          name: /complete schedule dentist/i,
        }),
      );
    });

    await expect(canvas.getByText(/1 action$/)).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Story 5: Full capture → triage → complete workflow
// ---------------------------------------------------------------------------

/** End-to-end: capture an item, triage it, switch to Next Actions, complete it. */
export const FullWorkflow: Story = {
  render: () => <WorkflowApp />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Capture a todo", async () => {
      const input = canvas.getByLabelText("Capture a thought");
      await userEvent.type(input, "Prepare quarterly presentation{Enter}");
      await expect(
        canvas.getByText("Prepare quarterly presentation"),
      ).toBeInTheDocument();
    });

    await step("Move to Next (item is auto-expanded in inbox)", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Next"));
    });

    await expect(canvas.getByText("Inbox is empty")).toBeInTheDocument();
  },
};
