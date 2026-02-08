import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilePreviewCard } from "./FilePreviewCard";

function createFile(name: string, size: number, type: string): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

// Mock URL.createObjectURL for image thumbnails
beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  });
});

describe("FilePreviewCard", () => {
  it("renders file name", () => {
    const file = createFile("report.pdf", 2048, "application/pdf");
    render(
      <FilePreviewCard file={file} onConfirm={vi.fn()} onDiscard={vi.fn()} />,
    );
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("renders formatted file size", () => {
    const file = createFile("doc.pdf", 1536 * 1024, "application/pdf");
    render(
      <FilePreviewCard file={file} onConfirm={vi.fn()} onDiscard={vi.fn()} />,
    );
    expect(screen.getByText("1.5 MB")).toBeInTheDocument();
  });

  it("renders KB for small files", () => {
    const file = createFile("small.txt", 2048, "text/plain");
    render(
      <FilePreviewCard file={file} onConfirm={vi.fn()} onDiscard={vi.fn()} />,
    );
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("pre-fills title with filename without extension", () => {
    const file = createFile("annual-report.pdf", 1024, "application/pdf");
    render(
      <FilePreviewCard file={file} onConfirm={vi.fn()} onDiscard={vi.fn()} />,
    );
    const input = screen.getByLabelText("Title") as HTMLInputElement;
    expect(input.value).toBe("annual-report");
  });

  it("allows editing the title", () => {
    const file = createFile("doc.pdf", 1024, "application/pdf");
    render(
      <FilePreviewCard file={file} onConfirm={vi.fn()} onDiscard={vi.fn()} />,
    );
    const input = screen.getByLabelText("Title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Custom title" } });
    expect(input.value).toBe("Custom title");
  });

  it("allows editing notes", () => {
    const file = createFile("doc.pdf", 1024, "application/pdf");
    render(
      <FilePreviewCard file={file} onConfirm={vi.fn()} onDiscard={vi.fn()} />,
    );
    const textarea = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Some notes about this file" },
    });
    expect(textarea.value).toBe("Some notes about this file");
  });

  it("calls onConfirm with correct meta when confirm button clicked", async () => {
    const user = userEvent.setup();
    const file = createFile("doc.pdf", 1024, "application/pdf");
    const onConfirm = vi.fn();
    render(
      <FilePreviewCard file={file} onConfirm={onConfirm} onDiscard={vi.fn()} />,
    );
    await user.click(screen.getByText("Add to Reference"));
    expect(onConfirm).toHaveBeenCalledWith({
      file,
      title: "doc",
      notes: "",
      tags: [],
      targetBucket: "reference",
    });
  });

  it("calls onDiscard when discard button clicked", async () => {
    const user = userEvent.setup();
    const file = createFile("doc.pdf", 1024, "application/pdf");
    const onDiscard = vi.fn();
    render(
      <FilePreviewCard file={file} onConfirm={vi.fn()} onDiscard={onDiscard} />,
    );
    await user.click(screen.getByText("Discard"));
    expect(onDiscard).toHaveBeenCalled();
  });

  it("shows 'Add to Reference' when targetBucket is reference", () => {
    const file = createFile("doc.pdf", 1024, "application/pdf");
    render(
      <FilePreviewCard
        file={file}
        onConfirm={vi.fn()}
        onDiscard={vi.fn()}
        targetBucket="reference"
      />,
    );
    expect(screen.getByText("Add to Reference")).toBeInTheDocument();
  });

  it("shows 'Add to Inbox' when targetBucket is inbox", () => {
    const file = createFile("doc.pdf", 1024, "application/pdf");
    render(
      <FilePreviewCard
        file={file}
        onConfirm={vi.fn()}
        onDiscard={vi.fn()}
        targetBucket="inbox"
      />,
    );
    expect(screen.getByText("Add to Inbox")).toBeInTheDocument();
  });

  it("shows image thumbnail for image files", () => {
    const file = createFile("photo.jpg", 1024, "image/jpeg");
    render(
      <FilePreviewCard file={file} onConfirm={vi.fn()} onDiscard={vi.fn()} />,
    );
    const img = screen.getByAltText("Preview");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "blob:mock-url");
  });

  it("does not show image thumbnail for non-image files", () => {
    const file = createFile("doc.pdf", 1024, "application/pdf");
    render(
      <FilePreviewCard file={file} onConfirm={vi.fn()} onDiscard={vi.fn()} />,
    );
    expect(screen.queryByAltText("Preview")).not.toBeInTheDocument();
  });

  it("supports adding tags", async () => {
    const user = userEvent.setup();
    const file = createFile("doc.pdf", 1024, "application/pdf");
    const onConfirm = vi.fn();
    render(
      <FilePreviewCard file={file} onConfirm={onConfirm} onDiscard={vi.fn()} />,
    );
    const tagInput = screen.getByLabelText("Add tag");
    await user.type(tagInput, "important{Enter}");
    expect(screen.getByText("important")).toBeInTheDocument();

    await user.click(screen.getByText("Add to Reference"));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["important"] }),
    );
  });
});
