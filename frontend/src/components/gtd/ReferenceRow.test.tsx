import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReferenceRow } from "./ReferenceRow";
import { createReferenceMaterial, resetFactoryCounter } from "@/model/factories";

beforeEach(() => resetFactoryCounter());

const baseRef = () =>
  createReferenceMaterial({
    title: "Company style guide",
  });

describe("ReferenceRow", () => {
  it("renders reference title", () => {
    const ref = baseRef();
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={vi.fn()}
      />,
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

  it("shows content type chip when contentType is set", () => {
    const ref = createReferenceMaterial({
      title: "Annual report",
      contentType: "application/pdf",
    });
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("shows origin badge matching the origin value", () => {
    const ref = createReferenceMaterial({
      title: "Triaged doc",
      origin: "triaged",
    });
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Triaged")).toBeInTheDocument();
  });

  it("shows origin badge for file origin", () => {
    const ref = createReferenceMaterial({
      title: "Uploaded file",
      origin: "file",
    });
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("File")).toBeInTheDocument();
  });

  it("shows external link when externalUrl is set", () => {
    const ref = createReferenceMaterial({
      title: "External resource",
      externalUrl: "https://example.com/doc",
    });
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    const link = screen.getByLabelText("Open external link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/doc");
  });

  it("shows note indicator when notes exist", () => {
    const ref = createReferenceMaterial({
      title: "Ref with notes",
      notes: "Some detailed notes here",
    });
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Has notes")).toBeInTheDocument();
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

  it("does not render checkbox or focus star", () => {
    const ref = baseRef();
    render(
      <ReferenceRow
        reference={ref}
        onArchive={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.queryByLabelText(/Complete/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Focus/),
    ).not.toBeInTheDocument();
  });
});
