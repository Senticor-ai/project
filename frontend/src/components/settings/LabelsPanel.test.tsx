import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelsPanel } from "./LabelsPanel";

const sampleContexts = ["@Buero", "@Telefon", "@Computer"];
const sampleTags = ["Dringend", "Vertraulich"];

describe("LabelsPanel", () => {
  it("renders existing contexts as chips", () => {
    render(
      <LabelsPanel
        contexts={sampleContexts}
        tags={sampleTags}
        onAddContext={vi.fn()}
        onRemoveContext={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
      />,
    );
    expect(screen.getByText("@Buero")).toBeInTheDocument();
    expect(screen.getByText("@Telefon")).toBeInTheDocument();
    expect(screen.getByText("@Computer")).toBeInTheDocument();
  });

  it("renders existing tags as chips", () => {
    render(
      <LabelsPanel
        contexts={sampleContexts}
        tags={sampleTags}
        onAddContext={vi.fn()}
        onRemoveContext={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
      />,
    );
    expect(screen.getByText("Dringend")).toBeInTheDocument();
    expect(screen.getByText("Vertraulich")).toBeInTheDocument();
  });

  it("adds a context via Enter key", async () => {
    const user = userEvent.setup();
    const onAddContext = vi.fn();
    render(
      <LabelsPanel
        contexts={sampleContexts}
        tags={[]}
        onAddContext={onAddContext}
        onRemoveContext={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("@phone, @office...");
    await user.type(input, "@Zuhause{Enter}");
    expect(onAddContext).toHaveBeenCalledWith("@Zuhause");
  });

  it("adds a context via Add button", async () => {
    const user = userEvent.setup();
    const onAddContext = vi.fn();
    render(
      <LabelsPanel
        contexts={[]}
        tags={[]}
        onAddContext={onAddContext}
        onRemoveContext={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("@phone, @office...");
    await user.type(input, "@Buero");
    await user.click(screen.getAllByText("Add")[0]!);
    expect(onAddContext).toHaveBeenCalledWith("@Buero");
  });

  it("removes a context when remove button is clicked", async () => {
    const user = userEvent.setup();
    const onRemoveContext = vi.fn();
    render(
      <LabelsPanel
        contexts={sampleContexts}
        tags={[]}
        onAddContext={vi.fn()}
        onRemoveContext={onRemoveContext}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Remove @Buero"));
    expect(onRemoveContext).toHaveBeenCalledWith("@Buero");
  });

  it("does not add empty context", async () => {
    const user = userEvent.setup();
    const onAddContext = vi.fn();
    render(
      <LabelsPanel
        contexts={[]}
        tags={[]}
        onAddContext={onAddContext}
        onRemoveContext={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("@phone, @office...");
    await user.type(input, "   {Enter}");
    expect(onAddContext).not.toHaveBeenCalled();
  });

  it("renders energy levels display", () => {
    render(
      <LabelsPanel
        contexts={[]}
        tags={[]}
        onAddContext={vi.fn()}
        onRemoveContext={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
      />,
    );
    expect(screen.getByText("low")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("adds a tag via Enter key", async () => {
    const user = userEvent.setup();
    const onAddTag = vi.fn();
    render(
      <LabelsPanel
        contexts={[]}
        tags={[]}
        onAddContext={vi.fn()}
        onRemoveContext={vi.fn()}
        onAddTag={onAddTag}
        onRemoveTag={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("New tag...");
    await user.type(input, "Dringend{Enter}");
    expect(onAddTag).toHaveBeenCalledWith("Dringend");
  });

  it("removes a tag when remove button is clicked", async () => {
    const user = userEvent.setup();
    const onRemoveTag = vi.fn();
    render(
      <LabelsPanel
        contexts={[]}
        tags={sampleTags}
        onAddContext={vi.fn()}
        onRemoveContext={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={onRemoveTag}
      />,
    );
    await user.click(screen.getByLabelText("Remove Dringend"));
    expect(onRemoveTag).toHaveBeenCalledWith("Dringend");
  });
});
