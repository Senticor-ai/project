import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ItemList, type ItemListProps } from "./ItemList";
import type { BaseEntity } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

// ---------------------------------------------------------------------------
// Mock items
// ---------------------------------------------------------------------------

interface DemoItem extends BaseEntity {
  bucket: "demo";
}

let nextId = 1;
function createDemoItem(name: string): DemoItem {
  const id = `urn:app:demo:${nextId++}` as CanonicalId;
  return {
    id,
    name,
    description: undefined,
    tags: [],
    references: [],
    captureSource: { kind: "thought" },
    provenance: {
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      history: [],
    },
    ports: [],
    needsEnrichment: false,
    confidence: "high",
    bucket: "demo",
  };
}

const activeItems = [
  createDemoItem("Review quarterly budget"),
  createDemoItem("Send meeting notes to team"),
  createDemoItem("Update project documentation"),
];

const doneItems = [
  createDemoItem("Book conference room"),
  createDemoItem("Order office supplies"),
];

// ---------------------------------------------------------------------------
// Wrapper for controlled state
// ---------------------------------------------------------------------------

function ItemListWrapper(props: ItemListProps<DemoItem>) {
  const [expandedId, setExpandedId] = useState<CanonicalId | null>(null);
  return (
    <ItemList
      {...props}
      expandedId={expandedId}
      onExpandedIdChange={setExpandedId}
    />
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: "Work/ItemList",
  component: ItemList,
  parameters: { layout: "padded" },
  render: (args) => <ItemListWrapper {...(args as ItemListProps<DemoItem>)} />,
} satisfies Meta<typeof ItemList>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    items: activeItems,
    header: {
      icon: "bolt",
      label: "Next Actions",
      subtitle: "To-do's for anytime",
    },
    renderItem: (item, { isExpanded }) => (
      <div
        key={item.id}
        className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm"
      >
        {item.name}
        {isExpanded && (
          <p className="mt-1 text-xs text-text-muted">Expanded detail view</p>
        )}
      </div>
    ),
    emptyMessage: "No actions here yet",
    footer: {
      formatCount: (n) => `${n} action${n !== 1 ? "s" : ""}`,
    },
    rapidEntry: {
      placeholder: "Rapid Entry — type here and hit enter",
      ariaLabel: "Rapid entry",
      onAdd: fn(),
    },
    expandedId: null,
    onExpandedIdChange: fn(),
  } as unknown as ItemListProps<BaseEntity>,
};

export const Empty: Story = {
  args: {
    ...Default.args,
    items: [],
    emptyHint: "Add an action to get started",
  } as unknown as ItemListProps<BaseEntity>,
};

export const WithDoneSection: Story = {
  args: {
    ...Default.args,
    secondarySection: {
      label: "Done",
      items: doneItems,
      renderItem: (item: DemoItem) => (
        <div
          key={item.id}
          className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-text-muted line-through"
        >
          {item.name}
        </div>
      ),
    },
  } as unknown as ItemListProps<BaseEntity>,
};

export const WithArchivedSection: Story = {
  args: {
    ...Default.args,
    header: {
      icon: "book",
      label: "Reference",
      subtitle: "Knowledge base & materials",
    },
    footer: {
      formatCount: (n: number) => `${n} reference${n !== 1 ? "s" : ""}`,
    },
    secondarySection: {
      label: "Archived",
      items: doneItems,
      renderItem: (item: DemoItem) => (
        <div
          key={item.id}
          className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm"
        >
          {item.name}
        </div>
      ),
      wrapperClassName: "opacity-60",
    },
  } as unknown as ItemListProps<BaseEntity>,
};

export const NoRapidEntry: Story = {
  args: {
    ...Default.args,
    rapidEntry: undefined,
  } as unknown as ItemListProps<BaseEntity>,
};

export const WithBeforeItems: Story = {
  args: {
    ...Default.args,
    beforeItems: (
      <div className="flex gap-2">
        <span className="rounded-full bg-paper-100 px-2 py-0.5 text-xs text-text-subtle">
          @phone (2)
        </span>
        <span className="rounded-full bg-paper-100 px-2 py-0.5 text-xs text-text-subtle">
          @computer (1)
        </span>
      </div>
    ),
  } as unknown as ItemListProps<BaseEntity>,
};
