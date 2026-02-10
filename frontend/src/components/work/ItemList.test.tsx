import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemList, type ItemListProps } from "./ItemList";
import type { BaseEntity } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestItem extends BaseEntity {
  bucket: "test";
}

let nextId = 1;
beforeEach(() => {
  nextId = 1;
});

function createTestItem(name: string): TestItem {
  const id = `urn:app:test:${nextId++}` as CanonicalId;
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
    bucket: "test",
  };
}

const noop = vi.fn();

function defaultProps(
  overrides: Partial<ItemListProps<TestItem>> = {},
): ItemListProps<TestItem> {
  return {
    items: [],
    header: { icon: "inbox", label: "Test List", subtitle: "A test list" },
    renderItem: (item, { isExpanded }) => (
      <div key={item.id} data-testid={`row-${item.id}`}>
        {item.name}
        {isExpanded && <span>expanded</span>}
      </div>
    ),
    emptyMessage: "No items yet",
    footer: {
      formatCount: (n) => `${n} item${n !== 1 ? "s" : ""}`,
    },
    expandedId: null,
    onExpandedIdChange: noop,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

describe("ItemList header", () => {
  it("renders header with label and subtitle", () => {
    render(<ItemList {...defaultProps()} />);
    expect(screen.getByText("Test List")).toBeInTheDocument();
    expect(screen.getByText("A test list")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("ItemList empty state", () => {
  it("shows empty message when no items", () => {
    render(<ItemList {...defaultProps()} />);
    expect(screen.getByText("No items yet")).toBeInTheDocument();
  });

  it("shows empty hint when provided", () => {
    render(<ItemList {...defaultProps({ emptyHint: "Add something" })} />);
    expect(screen.getByText("Add something")).toBeInTheDocument();
  });

  it("does not show empty hint when not provided", () => {
    render(<ItemList {...defaultProps()} />);
    expect(screen.queryByText("Add something")).not.toBeInTheDocument();
  });

  it("does not show empty state when items exist", () => {
    const items = [createTestItem("Item A")];
    render(<ItemList {...defaultProps({ items })} />);
    expect(screen.queryByText("No items yet")).not.toBeInTheDocument();
  });

  it("does not show empty state when secondary section has items", () => {
    const secondaryItems = [createTestItem("Done item")];
    render(
      <ItemList
        {...defaultProps({
          secondarySection: {
            label: "Done",
            items: secondaryItems,
            renderItem: (item) => <div key={item.id}>{item.name}</div>,
          },
        })}
      />,
    );
    expect(screen.queryByText("No items yet")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Rendering items
// ---------------------------------------------------------------------------

describe("ItemList item rendering", () => {
  it("renders items via renderItem prop", () => {
    const items = [createTestItem("Item A"), createTestItem("Item B")];
    render(<ItemList {...defaultProps({ items })} />);
    expect(screen.getByText("Item A")).toBeInTheDocument();
    expect(screen.getByText("Item B")).toBeInTheDocument();
  });

  it("passes isExpanded to renderItem", () => {
    const items = [createTestItem("Expanded item")];
    render(<ItemList {...defaultProps({ items, expandedId: items[0].id })} />);
    expect(screen.getByText("expanded")).toBeInTheDocument();
  });

  it("calls onExpandedIdChange when toggle is invoked", async () => {
    const user = userEvent.setup();
    const onExpandedIdChange = vi.fn();
    const items = [createTestItem("Click me")];
    render(
      <ItemList
        {...defaultProps({
          items,
          onExpandedIdChange,
          renderItem: (item, { onToggleExpand }) => (
            <button key={item.id} onClick={onToggleExpand}>
              {item.name}
            </button>
          ),
        })}
      />,
    );
    await user.click(screen.getByText("Click me"));
    expect(onExpandedIdChange).toHaveBeenCalledWith(items[0].id);
  });

  it("collapses when toggling already-expanded item", async () => {
    const user = userEvent.setup();
    const onExpandedIdChange = vi.fn();
    const items = [createTestItem("Expanded")];
    render(
      <ItemList
        {...defaultProps({
          items,
          expandedId: items[0].id,
          onExpandedIdChange,
          renderItem: (item, { onToggleExpand }) => (
            <button key={item.id} onClick={onToggleExpand}>
              {item.name}
            </button>
          ),
        })}
      />,
    );
    await user.click(screen.getByText("Expanded"));
    expect(onExpandedIdChange).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// Rapid entry
// ---------------------------------------------------------------------------

describe("ItemList rapid entry", () => {
  it("hides rapid entry when not configured", () => {
    render(<ItemList {...defaultProps()} />);
    expect(screen.queryByLabelText("Add item")).not.toBeInTheDocument();
  });

  it("shows rapid entry input", () => {
    render(
      <ItemList
        {...defaultProps({
          rapidEntry: {
            placeholder: "Type here...",
            ariaLabel: "Add item",
            onAdd: noop,
          },
        })}
      />,
    );
    expect(screen.getByLabelText("Add item")).toBeInTheDocument();
  });

  it("calls onAdd and clears input on Enter", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <ItemList
        {...defaultProps({
          rapidEntry: {
            placeholder: "Type here...",
            ariaLabel: "Add item",
            onAdd,
          },
        })}
      />,
    );
    const input = screen.getByLabelText("Add item");
    await user.type(input, "New item{Enter}");
    expect(onAdd).toHaveBeenCalledWith("New item");
    expect(input).toHaveValue("");
  });

  it("does not call onAdd for blank input", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <ItemList
        {...defaultProps({
          rapidEntry: {
            placeholder: "Type here...",
            ariaLabel: "Add item",
            onAdd,
          },
        })}
      />,
    );
    const input = screen.getByLabelText("Add item");
    await user.type(input, "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows error on async failure when showCaptureErrors is true", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <ItemList
        {...defaultProps({
          rapidEntry: {
            placeholder: "Type here...",
            ariaLabel: "Add item",
            onAdd,
            showCaptureErrors: true,
          },
        })}
      />,
    );
    const input = screen.getByLabelText("Add item");
    await user.type(input, "Broken{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/failed/i);
  });

  it("clears error when user types again", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <ItemList
        {...defaultProps({
          rapidEntry: {
            placeholder: "Type here...",
            ariaLabel: "Add item",
            onAdd,
            showCaptureErrors: true,
          },
        })}
      />,
    );
    const input = screen.getByLabelText("Add item");
    await user.type(input, "Broken{Enter}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.type(input, "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Secondary section (Done / Archived)
// ---------------------------------------------------------------------------

describe("ItemList secondary section", () => {
  it("does not render section when no secondary items", () => {
    render(
      <ItemList
        {...defaultProps({
          items: [createTestItem("Active")],
          secondarySection: {
            label: "Done",
            items: [],
            renderItem: (item) => <div key={item.id}>{item.name}</div>,
          },
        })}
      />,
    );
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("renders collapsed section label when items exist", () => {
    const secondaryItems = [createTestItem("Completed A")];
    render(
      <ItemList
        {...defaultProps({
          items: [createTestItem("Active")],
          secondarySection: {
            label: "Done",
            items: secondaryItems,
            renderItem: (item) => <div key={item.id}>{item.name}</div>,
          },
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Expand Done" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Completed A")).not.toBeInTheDocument();
  });

  it("expands to show items on click", async () => {
    const user = userEvent.setup();
    const secondaryItems = [createTestItem("Completed A")];
    render(
      <ItemList
        {...defaultProps({
          items: [createTestItem("Active")],
          secondarySection: {
            label: "Done",
            items: secondaryItems,
            renderItem: (item) => <div key={item.id}>{item.name}</div>,
          },
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Expand Done" }));
    expect(screen.getByText("Completed A")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse Done" }),
    ).toBeInTheDocument();
  });

  it("collapses on second click", async () => {
    const user = userEvent.setup();
    const secondaryItems = [createTestItem("Completed A")];
    render(
      <ItemList
        {...defaultProps({
          items: [createTestItem("Active")],
          secondarySection: {
            label: "Done",
            items: secondaryItems,
            renderItem: (item) => <div key={item.id}>{item.name}</div>,
          },
        })}
      />,
    );
    const btn = screen.getByRole("button", { name: "Expand Done" });
    await user.click(btn);
    expect(screen.getByText("Completed A")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse Done" }));
    expect(screen.queryByText("Completed A")).not.toBeInTheDocument();
  });

  it("applies wrapperClassName to expanded items", async () => {
    const user = userEvent.setup();
    const secondaryItems = [createTestItem("Archived item")];
    render(
      <ItemList
        {...defaultProps({
          items: [createTestItem("Active")],
          secondarySection: {
            label: "Archived",
            items: secondaryItems,
            renderItem: (item) => (
              <div key={item.id} data-testid="secondary-item">
                {item.name}
              </div>
            ),
            wrapperClassName: "opacity-60",
          },
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Expand Archived" }));
    const secondaryItem = screen.getByTestId("secondary-item");
    expect(secondaryItem.parentElement).toHaveClass("opacity-60");
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

describe("ItemList footer", () => {
  it("shows footer count for active items", () => {
    const items = [createTestItem("A"), createTestItem("B")];
    render(<ItemList {...defaultProps({ items })} />);
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("shows singular count for 1 item", () => {
    const items = [createTestItem("A")];
    render(<ItemList {...defaultProps({ items })} />);
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("does not show footer when no items and no secondary items", () => {
    render(<ItemList {...defaultProps()} />);
    expect(screen.queryByText(/^\d+ items?$/)).not.toBeInTheDocument();
  });

  it("shows footer when secondary items exist but no active items", () => {
    const secondaryItems = [createTestItem("Done")];
    render(
      <ItemList
        {...defaultProps({
          secondarySection: {
            label: "Done",
            items: secondaryItems,
            renderItem: (item) => <div key={item.id}>{item.name}</div>,
          },
        })}
      />,
    );
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// beforeItems slot
// ---------------------------------------------------------------------------

describe("ItemList beforeItems slot", () => {
  it("renders beforeItems between rapid entry and items", () => {
    const items = [createTestItem("Item A")];
    render(
      <ItemList
        {...defaultProps({
          items,
          rapidEntry: {
            placeholder: "Type...",
            ariaLabel: "Add item",
            onAdd: noop,
          },
          beforeItems: <div data-testid="filter-bar">Filters</div>,
        })}
      />,
    );
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
    // Verify ordering: rapid entry → filter bar → item
    const input = screen.getByLabelText("Add item");
    const filterBar = screen.getByTestId("filter-bar");
    const item = screen.getByText("Item A");
    expect(
      input.compareDocumentPosition(filterBar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      filterBar.compareDocumentPosition(item) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
