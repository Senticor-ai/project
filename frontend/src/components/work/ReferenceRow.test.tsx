import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReferenceRow } from "./ReferenceRow";
import {
  createReferenceMaterial,
  resetFactoryCounter,
} from "@/model/factories";

vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}));

beforeEach(() => resetFactoryCounter());

const baseRef = () =>
  createReferenceMaterial({
    name: "Company style guide",
  });

describe("ReferenceRow", () => {
  it("renders reference title", () => {
    const ref = baseRef();
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("Company style guide")).toBeInTheDocument();
  });

  it("calls onSelect when title clicked", async () => {
    const user = userEvent.setup();
    const ref = baseRef();
    const onSelect = vi.fn();
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={onSelect} />,
    );
    await user.click(screen.getByText("Company style guide"));
    expect(onSelect).toHaveBeenCalledWith(ref.id);
  });

  it("shows content type chip when encodingFormat is set", () => {
    const ref = createReferenceMaterial({
      name: "Annual report",
      encodingFormat: "application/pdf",
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("shows origin badge matching the origin value", () => {
    const ref = createReferenceMaterial({
      name: "Triaged doc",
      origin: "triaged",
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("Triaged")).toBeInTheDocument();
  });

  it("shows origin badge for file origin", () => {
    const ref = createReferenceMaterial({
      name: "Uploaded file",
      origin: "file",
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("File")).toBeInTheDocument();
  });

  it("shows external link when url is set", () => {
    const ref = createReferenceMaterial({
      name: "External resource",
      url: "https://example.com/doc",
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    const link = screen.getByLabelText("Open external link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/doc");
  });

  it("shows note indicator when notes exist", () => {
    const ref = createReferenceMaterial({
      name: "Ref with notes",
      description: "Some detailed notes here",
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(
      screen.getByLabelText("Show notes for Ref with notes"),
    ).toBeInTheDocument();
  });

  it("shows archive menu and calls onArchive", async () => {
    const user = userEvent.setup();
    const ref = baseRef();
    const onArchive = vi.fn();
    render(
      <ReferenceRow reference={ref} onArchive={onArchive} onSelect={vi.fn()} />,
    );
    await user.click(screen.getByLabelText("Actions for Company style guide"));
    expect(screen.getByText("Archive")).toBeInTheDocument();
    await user.click(screen.getByText("Archive"));
    expect(onArchive).toHaveBeenCalledWith(ref.id);
  });

  // -----------------------------------------------------------------------
  // Expand + ItemEditor
  // -----------------------------------------------------------------------

  it("clicking notes icon triggers expand", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const ref = createReferenceMaterial({
      name: "Noted ref",
      description: "Details here",
    });
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={vi.fn()}
        onToggleExpand={onToggleExpand}
      />,
    );
    await user.click(screen.getByLabelText("Show notes for Noted ref"));
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });

  it("title click toggles expand when onToggleExpand provided", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const onSelect = vi.fn();
    const ref = baseRef();
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={onSelect}
        onToggleExpand={onToggleExpand}
      />,
    );
    await user.click(screen.getByText("Company style guide"));
    expect(onToggleExpand).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders ItemEditor when expanded with onEdit", () => {
    const ref = createReferenceMaterial({
      name: "Editable ref",
      description: "Some notes",
    });
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={vi.fn()}
        isExpanded={true}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toHaveValue("Some notes");
  });

  it("does not render ItemEditor when collapsed", () => {
    const ref = createReferenceMaterial({
      name: "Collapsed ref",
      description: "Hidden notes",
    });
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={vi.fn()}
        isExpanded={false}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
  });

  it("does not render checkbox or focus star", () => {
    const ref = baseRef();
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.queryByLabelText(/Complete/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Focus/)).not.toBeInTheDocument();
  });

  it("renders drag handle", () => {
    const ref = baseRef();
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(
      screen.getByLabelText("Drag Company style guide"),
    ).toBeInTheDocument();
  });
});
