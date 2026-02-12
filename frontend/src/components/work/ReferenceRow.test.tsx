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

  // -----------------------------------------------------------------------
  // Linked action indicator (split-on-triage)
  // -----------------------------------------------------------------------

  it("shows linked action bucket badge when linkedActionBucket is set", () => {
    const ref = createReferenceMaterial({
      name: "Linked ref",
      origin: "triaged",
      encodingFormat: "application/pdf",
    });
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={vi.fn()}
        linkedActionBucket="next"
      />,
    );
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("does not show linked action badge when linkedActionBucket is absent", () => {
    const ref = createReferenceMaterial({
      name: "Standalone ref",
      origin: "triaged",
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    // "Next" badge should not appear
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // File view + download links
  // -----------------------------------------------------------------------

  it("shows view link for browser-viewable format (PDF)", () => {
    const ref = createReferenceMaterial({
      name: "Annual report",
      encodingFormat: "application/pdf",
      downloadUrl: "/files/file-123",
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    const link = screen.getByLabelText("View file");
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).not.toHaveAttribute("download");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/files/file-123?inline=true"),
    );
  });

  it("shows download link when downloadUrl is set", () => {
    const ref = createReferenceMaterial({
      name: "Annual report",
      encodingFormat: "application/pdf",
      downloadUrl: "/files/file-123",
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    const link = screen.getByLabelText("Download file");
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("download");
  });

  it("does not show view link for non-viewable format (DOCX)", () => {
    const ref = createReferenceMaterial({
      name: "Word doc",
      encodingFormat:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      downloadUrl: "/files/file-456",
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.queryByLabelText("View file")).not.toBeInTheDocument();
    // Download should still be there
    expect(screen.getByLabelText("Download file")).toBeInTheDocument();
  });

  it("shows view link for image formats", () => {
    const ref = createReferenceMaterial({
      name: "Photo",
      encodingFormat: "image/png",
      downloadUrl: "/files/file-789",
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByLabelText("View file")).toBeInTheDocument();
  });

  it("does not show any file links when downloadUrl is absent", () => {
    const ref = createReferenceMaterial({
      name: "Plain ref",
      encodingFormat: "application/pdf",
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.queryByLabelText("View file")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Download file")).not.toBeInTheDocument();
  });

  it("shows tag chips when tags exist", () => {
    const ref = createReferenceMaterial({
      name: "Tagged ref",
      tags: ["1099-int", "schedule-b"],
    });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("1099-int")).toBeInTheDocument();
    expect(screen.getByText("schedule-b")).toBeInTheDocument();
  });

  it("does not show tag chips when tags array is empty", () => {
    const ref = createReferenceMaterial({ name: "No tags", tags: [] });
    render(
      <ReferenceRow reference={ref} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.queryByText("1099-int")).not.toBeInTheDocument();
  });
});
