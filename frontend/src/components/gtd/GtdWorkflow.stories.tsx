import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { InboxList } from "./InboxList";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import type {
  InboxItem as InboxItemType,
  TriageResult,
  Project,
} from "@/model/gtd-types";
import {
  createInboxItem,
  createProject,
  resetFactoryCounter,
} from "@/model/factories";

// ---------------------------------------------------------------------------
// Shared data
// ---------------------------------------------------------------------------

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
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TriagedEntry {
  item: InboxItemType;
  result: TriageResult;
  dueDate: string;
}

// ---------------------------------------------------------------------------
// Composite workflow component
// ---------------------------------------------------------------------------

interface WorkflowAppProps {
  initialItems?: InboxItemType[];
  initialTriaged?: TriagedEntry[];
  projects?: Pick<Project, "id" | "title">[];
}

function WorkflowApp({
  initialItems = [],
  initialTriaged = [],
  projects = [],
}: WorkflowAppProps) {
  const [items, setItems] = useState<InboxItemType[]>(initialItems);
  const [triaged, setTriaged] = useState<TriagedEntry[]>(initialTriaged);
  const [completed, setCompleted] = useState<TriagedEntry[]>([]);

  return (
    <div className="space-y-6">
      <InboxList
        items={items}
        projects={projects}
        onCapture={(text) => {
          setItems((prev) => [...prev, createInboxItem({ title: text })]);
        }}
        onTriage={(item, result) => {
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          setTriaged((prev) => [
            ...prev,
            { item, result, dueDate: result.date ?? "" },
          ]);
        }}
      />

      {triaged.length > 0 && (
        <section aria-label="Review">
          <div className="rounded-[var(--radius-lg)] border border-border bg-paper-50 p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text">
              <Icon name="checklist" size={16} />
              Review ({triaged.length})
            </h2>
            <div className="space-y-2">
              {triaged.map((entry) => (
                <div
                  key={entry.item.id}
                  className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-2"
                >
                  <span className="flex-1 text-xs font-medium text-text">
                    {entry.item.title}
                  </span>
                  <span className="rounded-full bg-blueprint-50 px-2 py-0.5 text-xs text-blueprint-700">
                    {entry.result.targetBucket}
                  </span>
                  {entry.result.contexts &&
                    entry.result.contexts.length > 0 && (
                      <span className="text-xs text-text-muted">
                        {entry.result.contexts.join(", ")}
                      </span>
                    )}
                  {entry.result.energyLevel && (
                    <span className="text-xs text-text-muted">
                      {entry.result.energyLevel}
                    </span>
                  )}
                  <input
                    type="date"
                    value={entry.dueDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTriaged((prev) =>
                        prev.map((t) =>
                          t.item.id === entry.item.id
                            ? { ...t, dueDate: val }
                            : t,
                        ),
                      );
                    }}
                    aria-label={`Due date for ${entry.item.title}`}
                    className="rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5 text-xs"
                  />
                  <button
                    onClick={() => {
                      setTriaged((prev) =>
                        prev.filter((t) => t.item.id !== entry.item.id),
                      );
                      setCompleted((prev) => [...prev, entry]);
                    }}
                    aria-label={`Complete ${entry.item.title}`}
                    className={cn(
                      "rounded-[var(--radius-sm)] border border-border px-2 py-0.5 text-xs",
                      "hover:bg-paper-100",
                    )}
                  >
                    <Icon name="check" size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section aria-label="Completed">
          <div className="rounded-[var(--radius-lg)] border border-border bg-paper-50 p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text-muted">
              <Icon name="task_alt" size={16} />
              Completed ({completed.length})
            </h2>
            <div className="space-y-1">
              {completed.map((entry) => (
                <div
                  key={entry.item.id}
                  className="flex items-center gap-2 text-xs text-text-muted line-through"
                >
                  <Icon
                    name="check_circle"
                    size={12}
                    className="text-confidence-high"
                  />
                  {entry.item.title}
                  {entry.dueDate && (
                    <span className="text-text-subtle no-underline">
                      due {entry.dueDate}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pre-triaged data for review stories
// ---------------------------------------------------------------------------

const preTriagedItems: TriagedEntry[] = [
  {
    item: createInboxItem({ title: "Buy groceries for the week" }),
    result: { targetBucket: "next" },
    dueDate: "",
  },
  {
    item: createInboxItem({ title: "Call client about Q1 proposal" }),
    result: { targetBucket: "waiting", contexts: ["@phone"] },
    dueDate: "",
  },
  {
    item: createInboxItem({ title: "Plan team offsite agenda" }),
    result: { targetBucket: "someday", energyLevel: "high" },
    dueDate: "",
  },
];

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: "GTD/GtdWorkflow",
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

/** User captures 3 todos: personal, business call, and project-related. */
export const CaptureThreeTodos: Story = {
  render: () => <WorkflowApp />,
  play: async ({ canvas, userEvent, step }) => {
    const input = canvas.getByLabelText("Capture inbox item");

    await step("Capture personal todo", async () => {
      await userEvent.type(input, "Buy groceries for the week{Enter}");
      await expect(
        canvas.getByText("Buy groceries for the week"),
      ).toBeInTheDocument();
    });

    await step("Capture business call todo", async () => {
      await userEvent.type(input, "Call client about Q1 proposal{Enter}");
      await expect(
        canvas.getByText("Call client about Q1 proposal"),
      ).toBeInTheDocument();
    });

    await step("Capture project todo", async () => {
      await userEvent.type(
        input,
        "Draft project brief for website redesign{Enter}",
      );
      await expect(
        canvas.getByText("Draft project brief for website redesign"),
      ).toBeInTheDocument();
    });

    await expect(canvas.getByText(/3 items to process/)).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Story 2: Triage with labels
// ---------------------------------------------------------------------------

/** User triages a todo by adding a label tag. */
export const TriageWithLabels: Story = {
  render: () => (
    <WorkflowApp
      initialItems={[createInboxItem({ title: "Review annual budget report" })]}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await step("Expand options and add label", async () => {
      await userEvent.click(canvas.getByText("More options"));
      const contextInput = canvas.getByPlaceholderText("@phone, @office...");
      await userEvent.type(contextInput, "urgent{Enter}");
      await expect(canvas.getByText("urgent")).toBeInTheDocument();
    });

    await step("Triage to Next", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Next"));
    });

    await expect(canvas.getByText("Review (1)")).toBeInTheDocument();
    await expect(canvas.getByText("next")).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Story 3: Triage with context
// ---------------------------------------------------------------------------

/** User triages a todo with a @phone context. */
export const TriageWithContext: Story = {
  render: () => (
    <WorkflowApp
      initialItems={[
        createInboxItem({ title: "Call client about Q1 proposal" }),
      ]}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await step("Expand options and add context", async () => {
      await userEvent.click(canvas.getByText("More options"));
      const contextInput = canvas.getByPlaceholderText("@phone, @office...");
      await userEvent.type(contextInput, "@phone{Enter}");
      await expect(canvas.getByText("@phone")).toBeInTheDocument();
    });

    await step("Triage to Waiting", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Waiting"));
    });

    await expect(canvas.getByText("Review (1)")).toBeInTheDocument();
    await expect(canvas.getByText("waiting")).toBeInTheDocument();
    await expect(canvas.getByText("@phone")).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Story 4: Triage with complexity
// ---------------------------------------------------------------------------

/** User triages a todo and sets complexity to high. */
export const TriageWithComplexity: Story = {
  render: () => (
    <WorkflowApp
      initialItems={[createInboxItem({ title: "Plan team offsite agenda" })]}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await step("Expand and set complexity", async () => {
      await userEvent.click(canvas.getByText("More options"));
      await userEvent.click(canvas.getByText("high"));
    });

    await step("Triage to Someday", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Someday"));
    });

    await expect(canvas.getByText("Review (1)")).toBeInTheDocument();
    await expect(canvas.getByText("someday")).toBeInTheDocument();
    await expect(canvas.getByText("high")).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Story 5: Triage with all options
// ---------------------------------------------------------------------------

/** User triages with all options: label, context, complexity, due date, and project. */
export const TriageWithAllOptions: Story = {
  render: () => (
    <WorkflowApp
      initialItems={[
        createInboxItem({ title: "Prepare quarterly presentation" }),
      ]}
      projects={sampleProjects}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await step("Expand options", async () => {
      await userEvent.click(canvas.getByText("More options"));
    });

    await step("Select project", async () => {
      await userEvent.selectOptions(
        canvas.getByRole("combobox"),
        sampleProjects[0].id,
      );
    });

    await step("Set due date", async () => {
      const dateInput = canvas.getByLabelText("Date");
      await userEvent.clear(dateInput);
      await userEvent.type(dateInput, "2026-02-15");
    });

    await step("Add label and context", async () => {
      const contextInput = canvas.getByPlaceholderText("@phone, @office...");
      await userEvent.type(contextInput, "priority{Enter}");
      await userEvent.type(contextInput, "@office{Enter}");
      await expect(canvas.getByText("priority")).toBeInTheDocument();
      await expect(canvas.getByText("@office")).toBeInTheDocument();
    });

    await step("Set complexity to medium", async () => {
      await userEvent.click(canvas.getByText("medium"));
    });

    await step("Triage to Calendar", async () => {
      await userEvent.click(canvas.getByLabelText("Move to Calendar"));
    });

    await expect(canvas.getByText("Review (1)")).toBeInTheDocument();
    await expect(canvas.getByText("calendar")).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Story 6: Review and add due dates
// ---------------------------------------------------------------------------

/** User reviews triaged items and attaches due dates to 2 of them. */
export const ReviewAndAddDueDates: Story = {
  render: () => (
    <WorkflowApp initialTriaged={preTriagedItems.map((e) => ({ ...e }))} />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await expect(canvas.getByText("Review (3)")).toBeInTheDocument();

    await step("Add due date to first item", async () => {
      const dateInput = canvas.getByLabelText(
        "Due date for Buy groceries for the week",
      );
      await userEvent.type(dateInput, "2026-02-10");
      await expect(dateInput).toHaveValue("2026-02-10");
    });

    await step("Add due date to second item", async () => {
      const dateInput = canvas.getByLabelText(
        "Due date for Call client about Q1 proposal",
      );
      await userEvent.type(dateInput, "2026-02-12");
      await expect(dateInput).toHaveValue("2026-02-12");
    });

    // Third item should still have no date
    await expect(
      canvas.getByLabelText("Due date for Plan team offsite agenda"),
    ).toHaveValue("");
  },
};

// ---------------------------------------------------------------------------
// Story 7: Complete two todos
// ---------------------------------------------------------------------------

/** User completes 2 of the 3 triaged todos. */
export const CompleteTwoTodos: Story = {
  render: () => (
    <WorkflowApp
      initialTriaged={preTriagedItems.map((entry, i) => ({
        ...entry,
        dueDate: i < 2 ? `2026-02-${10 + i * 2}` : "",
      }))}
    />
  ),
  play: async ({ canvas, userEvent, step }) => {
    await expect(canvas.getByText("Review (3)")).toBeInTheDocument();

    await step("Complete first todo", async () => {
      await userEvent.click(
        canvas.getByLabelText("Complete Buy groceries for the week"),
      );
    });

    await expect(canvas.getByText("Completed (1)")).toBeInTheDocument();
    await expect(canvas.getByText("Review (2)")).toBeInTheDocument();

    await step("Complete second todo", async () => {
      await userEvent.click(
        canvas.getByLabelText("Complete Call client about Q1 proposal"),
      );
    });

    await expect(canvas.getByText("Completed (2)")).toBeInTheDocument();
    await expect(canvas.getByText("Review (1)")).toBeInTheDocument();
  },
};
