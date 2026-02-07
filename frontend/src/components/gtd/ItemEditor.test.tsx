import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemEditor } from "./ItemEditor";
import type { ItemEditableFields } from "@/model/gtd-types";

const defaults: ItemEditableFields = {
  contexts: [],
};

describe("ItemEditor", () => {
  it("renders date input with provided value", () => {
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={{ ...defaults, scheduledDate: "2026-03-01" }}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Date");
    expect(input).toHaveValue("2026-03-01");
  });

  it("calls onChange with scheduledDate when date changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ItemEditor values={defaults} onChange={onChange} />);

    const input = screen.getByLabelText("Date");
    await user.type(input, "2026-03-15");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledDate: expect.any(String) }),
    );
  });

  it("renders complexity buttons with selected state", () => {
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={{ ...defaults, energyLevel: "medium" }}
        onChange={onChange}
      />,
    );

    const mediumBtn = screen.getByRole("button", { name: "medium" });
    expect(mediumBtn).toHaveClass("font-medium");
  });

  it("calls onChange when complexity is toggled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ItemEditor values={defaults} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "high" }));
    expect(onChange).toHaveBeenCalledWith({ energyLevel: "high" });
  });

  it("deselects complexity when clicked again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={{ ...defaults, energyLevel: "high" }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "high" }));
    expect(onChange).toHaveBeenCalledWith({ energyLevel: undefined });
  });

  it("renders context chips from values", () => {
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={{ ...defaults, contexts: ["@phone", "@office"] }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("@phone")).toBeInTheDocument();
    expect(screen.getByText("@office")).toBeInTheDocument();
  });

  it("adds context on Enter and calls onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ItemEditor values={defaults} onChange={onChange} />);

    const input = screen.getByPlaceholderText("@phone, @office...");
    await user.type(input, "@home{Enter}");
    expect(onChange).toHaveBeenCalledWith({ contexts: ["@home"] });
  });

  it("adds context via Add button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ItemEditor values={defaults} onChange={onChange} />);

    const input = screen.getByPlaceholderText("@phone, @office...");
    await user.type(input, "@home");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenCalledWith({ contexts: ["@home"] });
  });

  it("removes context and calls onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={{ ...defaults, contexts: ["@phone", "@office"] }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText("Remove @phone"));
    expect(onChange).toHaveBeenCalledWith({ contexts: ["@office"] });
  });

  it("renders project dropdown when projects provided", () => {
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={defaults}
        onChange={onChange}
        projects={[
          { id: "p-1" as any, title: "Project A" },
          { id: "p-2" as any, title: "Project B" },
        ]}
      />,
    );

    expect(screen.getByLabelText("Assign to project")).toBeInTheDocument();
  });

  it("does not render project dropdown when no projects", () => {
    const onChange = vi.fn();
    render(<ItemEditor values={defaults} onChange={onChange} />);

    expect(screen.queryByLabelText("Assign to project")).not.toBeInTheDocument();
  });

  it("calls onChange with projectId on project selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={defaults}
        onChange={onChange}
        projects={[{ id: "p-1" as any, title: "Project A" }]}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText("Assign to project"),
      "p-1",
    );
    expect(onChange).toHaveBeenCalledWith({ projectId: "p-1" });
  });

  it("prevents duplicate contexts", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={{ ...defaults, contexts: ["@phone"] }}
        onChange={onChange}
      />,
    );

    const input = screen.getByPlaceholderText("@phone, @office...");
    await user.type(input, "@phone{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });
});
