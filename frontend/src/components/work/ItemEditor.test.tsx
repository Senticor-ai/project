import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemEditor } from "./ItemEditor";
import type { ItemEditableFields } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

const defaults: ItemEditableFields = {
  contexts: [],
  tags: [],
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

    const input = screen.getByPlaceholderText("@Büro, @Telefon...");
    await user.type(input, "@home{Enter}");
    expect(onChange).toHaveBeenCalledWith({ contexts: ["@home"] });
  });

  it("adds context via Add button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ItemEditor values={defaults} onChange={onChange} />);

    const input = screen.getByPlaceholderText("@Büro, @Telefon...");
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
          { id: "p-1" as CanonicalId, name: "Project A" },
          { id: "p-2" as CanonicalId, name: "Project B" },
        ]}
      />,
    );

    expect(screen.getByLabelText("Assign to project")).toBeInTheDocument();
  });

  it("does not render project dropdown when no projects", () => {
    const onChange = vi.fn();
    render(<ItemEditor values={defaults} onChange={onChange} />);

    expect(
      screen.queryByLabelText("Assign to project"),
    ).not.toBeInTheDocument();
  });

  it("calls onChange with projectId on project selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={defaults}
        onChange={onChange}
        projects={[{ id: "p-1" as CanonicalId, name: "Project A" }]}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Assign to project"), "p-1");
    expect(onChange).toHaveBeenCalledWith({ projectId: "p-1" });
  });

  // -----------------------------------------------------------------------
  // Notes field
  // -----------------------------------------------------------------------

  it("renders notes textarea with placeholder", () => {
    render(<ItemEditor values={defaults} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Add notes...")).toBeInTheDocument();
  });

  it("renders notes textarea with existing value", () => {
    render(
      <ItemEditor
        values={{ ...defaults, description: "Some existing notes" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Notes")).toHaveValue("Some existing notes");
  });

  it("calls onChange with notes on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ItemEditor values={defaults} onChange={onChange} />);

    const textarea = screen.getByLabelText("Notes");
    await user.click(textarea);
    await user.type(textarea, "New notes content");
    await user.tab();

    expect(onChange).toHaveBeenCalledWith({ description: "New notes content" });
  });

  it("does not call onChange on blur when notes unchanged", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={{ ...defaults, description: "Existing" }}
        onChange={onChange}
      />,
    );

    const textarea = screen.getByLabelText("Notes");
    await user.click(textarea);
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows multiline input in notes (Enter inserts newline)", async () => {
    const user = userEvent.setup();
    render(<ItemEditor values={defaults} onChange={vi.fn()} />);

    const textarea = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    await user.click(textarea);
    await user.type(textarea, "line1{Enter}line2");

    expect(textarea.value).toContain("line1");
    expect(textarea.value).toContain("line2");
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

    const input = screen.getByPlaceholderText("@Büro, @Telefon...");
    await user.type(input, "@phone{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Tags
  // -----------------------------------------------------------------------

  it("renders tag chips from values", () => {
    render(
      <ItemEditor
        values={{ ...defaults, tags: ["1099-int", "schedule-b"] }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("1099-int")).toBeInTheDocument();
    expect(screen.getByText("schedule-b")).toBeInTheDocument();
  });

  it("adds tag on Enter and calls onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ItemEditor values={defaults} onChange={onChange} />);

    const input = screen.getByPlaceholderText("Steuerrecht, Eilig...");
    await user.type(input, "w-2{Enter}");
    expect(onChange).toHaveBeenCalledWith({ tags: ["w-2"] });
  });

  it("adds tag via Add tag button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ItemEditor values={defaults} onChange={onChange} />);

    const input = screen.getByPlaceholderText("Steuerrecht, Eilig...");
    await user.type(input, "w-2");
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(onChange).toHaveBeenCalledWith({ tags: ["w-2"] });
  });

  it("removes tag and calls onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={{ ...defaults, tags: ["1099-int", "schedule-b"] }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText("Remove tag 1099-int"));
    expect(onChange).toHaveBeenCalledWith({ tags: ["schedule-b"] });
  });

  it("prevents duplicate tags", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={{ ...defaults, tags: ["w-2"] }}
        onChange={onChange}
      />,
    );

    const input = screen.getByPlaceholderText("Steuerrecht, Eilig...");
    await user.type(input, "w-2{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Organization selector
  // -----------------------------------------------------------------------

  const orgs = [
    { id: "org-1", name: "Nueva Tierra" },
    { id: "org-2", name: "Autonomo Wolfgang" },
  ];

  it("shows org selector when organizations provided", () => {
    render(
      <ItemEditor values={defaults} onChange={vi.fn()} organizations={orgs} />,
    );
    expect(screen.getByLabelText("Assign to organization")).toBeInTheDocument();
  });

  it("hides org selector when no organizations", () => {
    render(<ItemEditor values={defaults} onChange={vi.fn()} />);
    expect(
      screen.queryByLabelText("Assign to organization"),
    ).not.toBeInTheDocument();
  });

  it("calls onChange with orgRef when org selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ItemEditor values={defaults} onChange={onChange} organizations={orgs} />,
    );

    const select = screen.getByLabelText("Assign to organization");
    await user.selectOptions(select, "org-1");
    expect(onChange).toHaveBeenCalledWith({
      orgRef: { id: "org-1", name: "Nueva Tierra" },
    });
  });

  it("calls onChange with undefined orgRef when None selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ItemEditor
        values={{
          ...defaults,
          orgRef: { id: "org-1", name: "Nueva Tierra" },
        }}
        onChange={onChange}
        organizations={orgs}
      />,
    );

    const select = screen.getByLabelText("Assign to organization");
    await user.selectOptions(select, "");
    expect(onChange).toHaveBeenCalledWith({ orgRef: undefined });
  });
});
