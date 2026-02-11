import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FileDropZone } from "./FileDropZone";

function createFile(name: string, size: number, type: string): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

function createDropEvent(files: File[]): {
  dataTransfer: { files: File[]; types: string[] };
} {
  return {
    dataTransfer: {
      files,
      types: ["Files"],
    },
  };
}

function createDragEvent(): { dataTransfer: { types: string[] } } {
  return {
    dataTransfer: {
      types: ["Files"],
    },
  };
}

describe("FileDropZone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children content", () => {
    render(
      <FileDropZone onFilesDropped={vi.fn()}>
        <p>Child content</p>
      </FileDropZone>,
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("shows 'Drop files here' text", () => {
    render(<FileDropZone onFilesDropped={vi.fn()} />);
    expect(screen.getByText("Drop files here")).toBeInTheDocument();
  });

  it("shows max size limit", () => {
    render(<FileDropZone onFilesDropped={vi.fn()} maxSizeMb={10} />);
    expect(screen.getByText("Max 10 MB")).toBeInTheDocument();
  });

  it("applies drag-over styling when dragenter fires", () => {
    render(<FileDropZone onFilesDropped={vi.fn()} />);
    const zone = screen.getByTestId("file-drop-zone");

    fireEvent.dragEnter(zone, createDragEvent());

    expect(screen.getByText("Release to upload")).toBeInTheDocument();
  });

  it("removes drag-over styling on dragleave", () => {
    render(<FileDropZone onFilesDropped={vi.fn()} />);
    const zone = screen.getByTestId("file-drop-zone");

    fireEvent.dragEnter(zone, createDragEvent());
    expect(screen.getByText("Release to upload")).toBeInTheDocument();

    fireEvent.dragLeave(zone, createDragEvent());
    expect(screen.getByText("Drop files here")).toBeInTheDocument();
  });

  it("calls onFilesDropped with valid files on drop", () => {
    const onFilesDropped = vi.fn();
    render(<FileDropZone onFilesDropped={onFilesDropped} />);
    const zone = screen.getByTestId("file-drop-zone");

    const file = createFile("test.pdf", 1024, "application/pdf");
    fireEvent.drop(zone, createDropEvent([file]));

    expect(onFilesDropped).toHaveBeenCalledWith([file]);
  });

  it("rejects files exceeding maxSizeMb", () => {
    const onFilesDropped = vi.fn();
    render(<FileDropZone onFilesDropped={onFilesDropped} maxSizeMb={1} />);
    const zone = screen.getByTestId("file-drop-zone");

    const largeFile = createFile(
      "huge.pdf",
      2 * 1024 * 1024,
      "application/pdf",
    );
    fireEvent.drop(zone, createDropEvent([largeFile]));

    expect(onFilesDropped).not.toHaveBeenCalled();
    expect(screen.getByText(/huge\.pdf.*too large/)).toBeInTheDocument();
  });

  it("rejects files not matching allowedTypes", () => {
    const onFilesDropped = vi.fn();
    render(
      <FileDropZone
        onFilesDropped={onFilesDropped}
        allowedTypes={["application/pdf"]}
      />,
    );
    const zone = screen.getByTestId("file-drop-zone");

    const wrongFile = createFile("photo.png", 1024, "image/png");
    fireEvent.drop(zone, createDropEvent([wrongFile]));

    expect(onFilesDropped).not.toHaveBeenCalled();
    expect(
      screen.getByText(/photo\.png.*type not allowed/),
    ).toBeInTheDocument();
  });

  it("supports wildcard type matching", () => {
    const onFilesDropped = vi.fn();
    render(
      <FileDropZone
        onFilesDropped={onFilesDropped}
        allowedTypes={["image/*"]}
      />,
    );
    const zone = screen.getByTestId("file-drop-zone");

    const imageFile = createFile("photo.jpg", 1024, "image/jpeg");
    fireEvent.drop(zone, createDropEvent([imageFile]));

    expect(onFilesDropped).toHaveBeenCalledWith([imageFile]);
  });

  it("auto-clears error state after 5 seconds", () => {
    vi.useFakeTimers();
    const onFilesDropped = vi.fn();
    render(<FileDropZone onFilesDropped={onFilesDropped} maxSizeMb={1} />);
    const zone = screen.getByTestId("file-drop-zone");

    const largeFile = createFile(
      "huge.pdf",
      2 * 1024 * 1024,
      "application/pdf",
    );
    fireEvent.drop(zone, createDropEvent([largeFile]));

    expect(screen.getByText(/huge\.pdf.*too large/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText(/huge\.pdf.*too large/)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("accepts multiple files when multiple is true", () => {
    const onFilesDropped = vi.fn();
    render(<FileDropZone onFilesDropped={onFilesDropped} multiple />);
    const zone = screen.getByTestId("file-drop-zone");

    const file1 = createFile("a.pdf", 1024, "application/pdf");
    const file2 = createFile("b.pdf", 1024, "application/pdf");
    fireEvent.drop(zone, createDropEvent([file1, file2]));

    expect(onFilesDropped).toHaveBeenCalledWith([file1, file2]);
  });
});

describe("FileDropZone variant='overlay'", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not show static hint text at rest", () => {
    render(
      <FileDropZone variant="overlay" onFilesDropped={vi.fn()}>
        <p>Inbox content</p>
      </FileDropZone>,
    );
    expect(screen.queryByText("Drop files here")).not.toBeInTheDocument();
    expect(screen.getByText("Inbox content")).toBeInTheDocument();
  });

  it("does not have dashed border at rest", () => {
    render(
      <FileDropZone variant="overlay" onFilesDropped={vi.fn()}>
        <p>Content</p>
      </FileDropZone>,
    );
    const zone = screen.getByTestId("file-drop-zone");
    expect(zone.className).not.toContain("border-dashed");
  });

  it("shows overlay on file drag-over", () => {
    render(
      <FileDropZone variant="overlay" onFilesDropped={vi.fn()}>
        <p>Content</p>
      </FileDropZone>,
    );
    const zone = screen.getByTestId("file-drop-zone");

    fireEvent.dragEnter(zone, createDragEvent());

    expect(screen.getByText("Release to upload")).toBeInTheDocument();
  });

  it("hides overlay on drag-leave", () => {
    render(
      <FileDropZone variant="overlay" onFilesDropped={vi.fn()}>
        <p>Content</p>
      </FileDropZone>,
    );
    const zone = screen.getByTestId("file-drop-zone");

    fireEvent.dragEnter(zone, createDragEvent());
    expect(screen.getByText("Release to upload")).toBeInTheDocument();

    fireEvent.dragLeave(zone, createDragEvent());
    expect(screen.queryByText("Release to upload")).not.toBeInTheDocument();
  });

  it("calls onFilesDropped on file drop", () => {
    const onFilesDropped = vi.fn();
    render(
      <FileDropZone variant="overlay" onFilesDropped={onFilesDropped}>
        <p>Content</p>
      </FileDropZone>,
    );
    const zone = screen.getByTestId("file-drop-zone");

    const file = createFile("test.pdf", 1024, "application/pdf");
    fireEvent.drop(zone, createDropEvent([file]));

    expect(onFilesDropped).toHaveBeenCalledWith([file]);
  });

  it("ignores non-file drags (no overlay shown)", () => {
    render(
      <FileDropZone variant="overlay" onFilesDropped={vi.fn()}>
        <p>Content</p>
      </FileDropZone>,
    );
    const zone = screen.getByTestId("file-drop-zone");

    fireEvent.dragEnter(zone, {
      dataTransfer: { types: ["text/plain"] },
    });

    expect(screen.queryByText("Release to upload")).not.toBeInTheDocument();
  });

  it("shows error messages on invalid file drop", () => {
    const onFilesDropped = vi.fn();
    render(
      <FileDropZone
        variant="overlay"
        onFilesDropped={onFilesDropped}
        maxSizeMb={1}
      >
        <p>Content</p>
      </FileDropZone>,
    );
    const zone = screen.getByTestId("file-drop-zone");

    const largeFile = createFile(
      "huge.pdf",
      2 * 1024 * 1024,
      "application/pdf",
    );
    fireEvent.drop(zone, createDropEvent([largeFile]));

    expect(onFilesDropped).not.toHaveBeenCalled();
    expect(screen.getByText(/huge\.pdf.*too large/)).toBeInTheDocument();
  });
});
