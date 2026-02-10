import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReferenceList } from "./ReferenceList";
import {
  createReferenceMaterial,
  resetFactoryCounter,
} from "@/model/factories";
import type { Provenance } from "@/model/types";

beforeEach(() => resetFactoryCounter());

function withCreatedAt(date: string): Provenance {
  return {
    createdAt: date,
    updatedAt: date,
    history: [{ timestamp: date, action: "created" }],
  };
}

const makeRefs = () => [
  createReferenceMaterial({
    name: "Older doc",
    origin: "captured",
    provenance: withCreatedAt("2025-01-01T10:00:00Z"),
  }),
  createReferenceMaterial({
    name: "Newer doc",
    origin: "triaged",
    provenance: withCreatedAt("2025-06-15T10:00:00Z"),
  }),
  createReferenceMaterial({
    name: "File upload",
    origin: "file",
    provenance: withCreatedAt("2025-03-10T10:00:00Z"),
  }),
];

const noop = vi.fn();

describe("ReferenceList", () => {
  it("renders header with title and subtitle", () => {
    render(
      <ReferenceList
        references={[]}
        onAdd={noop}
        onArchive={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText("Reference")).toBeInTheDocument();
    expect(screen.getByText("Knowledge base & materials")).toBeInTheDocument();
  });

  it("shows empty state when no references", () => {
    render(
      <ReferenceList
        references={[]}
        onAdd={noop}
        onArchive={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText("No reference items yet")).toBeInTheDocument();
  });

  it("renders all non-archived reference items", () => {
    const refs = makeRefs();
    render(
      <ReferenceList
        references={refs}
        onAdd={noop}
        onArchive={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText("Older doc")).toBeInTheDocument();
    expect(screen.getByText("Newer doc")).toBeInTheDocument();
    expect(screen.getByText("File upload")).toBeInTheDocument();
  });

  it("hides archived reference items", () => {
    const refs = [
      createReferenceMaterial({ name: "Active ref" }),
      createReferenceMaterial({
        title: "Archived ref",
        provenance: {
          createdAt: "2025-01-01T10:00:00Z",
          updatedAt: "2025-01-02T10:00:00Z",
          archivedAt: "2025-01-02T10:00:00Z",
          history: [],
        },
      }),
    ];
    render(
      <ReferenceList
        references={refs}
        onAdd={noop}
        onArchive={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText("Active ref")).toBeInTheDocument();
    expect(screen.queryByText("Archived ref")).not.toBeInTheDocument();
  });

  it("shows reference count in footer", () => {
    const refs = makeRefs();
    render(
      <ReferenceList
        references={refs}
        onAdd={noop}
        onArchive={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText("3 references")).toBeInTheDocument();
  });

  it("shows singular count for 1 reference", () => {
    const refs = [createReferenceMaterial({ name: "Only one" })];
    render(
      <ReferenceList
        references={refs}
        onAdd={noop}
        onArchive={noop}
        onSelect={noop}
      />,
    );
    expect(screen.getByText("1 reference")).toBeInTheDocument();
  });

  it("calls onAdd via rapid entry", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <ReferenceList
        references={[]}
        onAdd={onAdd}
        onArchive={noop}
        onSelect={noop}
      />,
    );
    const input = screen.getByLabelText("Rapid entry");
    await user.type(input, "New reference{Enter}");
    expect(onAdd).toHaveBeenCalledWith("New reference");
  });

  it("clears input after successful add", async () => {
    const user = userEvent.setup();
    render(
      <ReferenceList
        references={[]}
        onAdd={vi.fn()}
        onArchive={noop}
        onSelect={noop}
      />,
    );
    const input = screen.getByLabelText("Rapid entry") as HTMLTextAreaElement;
    await user.type(input, "New reference{Enter}");
    expect(input.value).toBe("");
  });

  // -----------------------------------------------------------------------
  // Collapsible Archived section
  // -----------------------------------------------------------------------

  it("does not show Archived section when no archived items", () => {
    const refs = [createReferenceMaterial({ name: "Active ref" })];
    render(
      <ReferenceList
        references={refs}
        onAdd={noop}
        onArchive={noop}
        onSelect={noop}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Archived/ }),
    ).not.toBeInTheDocument();
  });

  it("shows collapsed Archived section when archived items exist", () => {
    const refs = [
      createReferenceMaterial({ name: "Active ref" }),
      createReferenceMaterial({
        title: "Archived ref",
        provenance: {
          createdAt: "2025-01-01T10:00:00Z",
          updatedAt: "2025-01-02T10:00:00Z",
          archivedAt: "2025-01-02T10:00:00Z",
          history: [],
        },
      }),
    ];
    render(
      <ReferenceList
        references={refs}
        onAdd={noop}
        onArchive={noop}
        onSelect={noop}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Expand Archived" }),
    ).toBeInTheDocument();
  });

  it("shows archived items after expanding Archived section", async () => {
    const user = userEvent.setup();
    const refs = [
      createReferenceMaterial({ name: "Active ref" }),
      createReferenceMaterial({
        name: "Archived A",
        provenance: {
          createdAt: "2025-01-01T10:00:00Z",
          updatedAt: "2025-01-02T10:00:00Z",
          archivedAt: "2025-06-01T10:00:00Z",
          history: [],
        },
      }),
      createReferenceMaterial({
        name: "Archived B",
        provenance: {
          createdAt: "2025-02-01T10:00:00Z",
          updatedAt: "2025-02-02T10:00:00Z",
          archivedAt: "2025-05-15T10:00:00Z",
          history: [],
        },
      }),
    ];
    render(
      <ReferenceList
        references={refs}
        onAdd={noop}
        onArchive={noop}
        onSelect={noop}
      />,
    );

    expect(screen.queryByText("Archived A")).not.toBeInTheDocument();
    expect(screen.queryByText("Archived B")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Archived" }));

    expect(screen.getByText("Archived A")).toBeInTheDocument();
    expect(screen.getByText("Archived B")).toBeInTheDocument();
  });

  it("collapses Archived section on second click", async () => {
    const user = userEvent.setup();
    const refs = [
      createReferenceMaterial({ name: "Active" }),
      createReferenceMaterial({
        name: "Archived item",
        provenance: {
          createdAt: "2025-01-01T10:00:00Z",
          updatedAt: "2025-01-02T10:00:00Z",
          archivedAt: "2025-01-02T10:00:00Z",
          history: [],
        },
      }),
    ];
    render(
      <ReferenceList
        references={refs}
        onAdd={noop}
        onArchive={noop}
        onSelect={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Expand Archived" }));
    expect(screen.getByText("Archived item")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Archived" }));
    expect(screen.queryByText("Archived item")).not.toBeInTheDocument();
  });

  it("sorts items newest first", () => {
    const refs = makeRefs();
    render(
      <ReferenceList
        references={refs}
        onAdd={noop}
        onArchive={noop}
        onSelect={noop}
      />,
    );
    const newer = screen.getByText("Newer doc");
    const older = screen.getByText("Older doc");
    expect(
      newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
