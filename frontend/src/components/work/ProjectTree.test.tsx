import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectTree } from "./ProjectTree";
import {
  createActionItem,
  createProject,
  resetFactoryCounter,
} from "@/model/factories";
import type { ActionItem, Project } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

beforeEach(() => resetFactoryCounter());

const noop = vi.fn();

function makeProject(overrides?: Partial<Project> & { name?: string }) {
  return createProject({
    name: "Website Redesign",
    desiredOutcome: "New site live",
    ...overrides,
  });
}

function makeAction(
  overrides: Partial<ActionItem> & { name: string } & {
    projectId?: CanonicalId;
  },
) {
  return createActionItem({ bucket: "next", ...overrides });
}

function renderTree(
  projects: Project[] = [],
  actions: ActionItem[] = [],
  overrides: Partial<React.ComponentProps<typeof ProjectTree>> = {},
) {
  return render(
    <ProjectTree
      projects={projects}
      actions={actions}
      onCompleteAction={noop}
      onToggleFocus={noop}
      onAddAction={noop}
      {...overrides}
    />,
  );
}

describe("ProjectTree", () => {
  it("renders Projects header", () => {
    renderTree();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Multi-step outcomes")).toBeInTheDocument();
  });

  it("shows empty state when no projects", () => {
    renderTree([]);
    expect(screen.getByText("No active projects")).toBeInTheDocument();
  });

  it("renders project titles", () => {
    const p1 = makeProject({ name: "Website Redesign" });
    const p2 = makeProject({ name: "Mobile App" });
    renderTree([p1, p2]);
    expect(screen.getByText("Website Redesign")).toBeInTheDocument();
    expect(screen.getByText("Mobile App")).toBeInTheDocument();
  });

  it("shows active project count", () => {
    const p1 = makeProject({ name: "Project A" });
    const p2 = makeProject({ name: "Project B" });
    renderTree([p1, p2]);
    expect(screen.getByText("2 projects")).toBeInTheDocument();
  });

  it("singular count for one project", () => {
    const p1 = makeProject({ name: "Solo Project" });
    renderTree([p1]);
    expect(screen.getByText("1 project")).toBeInTheDocument();
  });

  it("hides completed projects", () => {
    const active = makeProject({ name: "Active Project" });
    const completed = makeProject({
      name: "Done Project",
      status: "completed",
    });
    renderTree([active, completed]);
    expect(screen.getByText("Active Project")).toBeInTheDocument();
    expect(screen.queryByText("Done Project")).not.toBeInTheDocument();
  });

  it("hides archived projects", () => {
    const active = makeProject({ name: "Active" });
    const archived = makeProject({ name: "Archived", status: "archived" });
    renderTree([active, archived]);
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("expands project on click to show actions", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "My Project" });
    const action = makeAction({
      name: "Design wireframes",
      projectId: project.id,
      sequenceOrder: 1,
    });

    renderTree([project], [action]);
    expect(screen.queryByText("Design wireframes")).not.toBeInTheDocument();

    await user.click(screen.getByText("My Project"));
    expect(screen.getByText("Design wireframes")).toBeInTheDocument();
  });

  it("collapses project on second click", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Toggle Me" });
    const action = makeAction({
      name: "Task A",
      projectId: project.id,
      sequenceOrder: 1,
    });

    renderTree([project], [action]);
    await user.click(screen.getByText("Toggle Me"));
    expect(screen.getByText("Task A")).toBeInTheDocument();

    await user.click(screen.getByText("Toggle Me"));
    expect(screen.queryByText("Task A")).not.toBeInTheDocument();
  });

  it("only expands one project at a time", async () => {
    const user = userEvent.setup();
    const p1 = makeProject({ name: "Project Alpha" });
    const p2 = makeProject({ name: "Project Beta" });
    const a1 = makeAction({
      name: "Alpha task",
      projectId: p1.id,
      sequenceOrder: 1,
    });
    const a2 = makeAction({
      name: "Beta task",
      projectId: p2.id,
      sequenceOrder: 1,
    });

    renderTree([p1, p2], [a1, a2]);

    await user.click(screen.getByText("Project Alpha"));
    expect(screen.getByText("Alpha task")).toBeInTheDocument();

    await user.click(screen.getByText("Project Beta"));
    expect(screen.queryByText("Alpha task")).not.toBeInTheDocument();
    expect(screen.getByText("Beta task")).toBeInTheDocument();
  });

  it("highlights next action with ring and leaves future actions plain", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Sequential" });
    const completed = makeAction({
      name: "Done step",
      projectId: project.id,
      sequenceOrder: 1,
      completedAt: new Date().toISOString(),
    });
    const nextAction = makeAction({
      name: "Current step",
      projectId: project.id,
      sequenceOrder: 2,
    });
    const future = makeAction({
      name: "Future step",
      projectId: project.id,
      sequenceOrder: 3,
    });

    renderTree([project], [completed, nextAction, future]);
    await user.click(screen.getByText("Sequential"));

    // Next action row should be highlighted with a ring
    const currentRow = screen
      .getByText("Current step")
      .closest("[data-action-id]")!;
    expect(currentRow.className).toContain("ring-2");
    expect(currentRow.className).toContain("ring-blueprint-300");

    // Future action should NOT have the ring highlight
    const futureRow = screen
      .getByText("Future step")
      .closest("[data-action-id]")!;
    expect(futureRow.className).not.toContain("ring-2");
  });

  it("calls onCompleteAction when checkbox clicked", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Complete Test" });
    const action = makeAction({
      name: "Completable",
      projectId: project.id,
      sequenceOrder: 1,
    });
    const onComplete = vi.fn();

    renderTree([project], [action], { onCompleteAction: onComplete });
    await user.click(screen.getByText("Complete Test"));

    const completeBtn = screen.getByRole("button", {
      name: /complete completable/i,
    });
    await user.click(completeBtn);
    expect(onComplete).toHaveBeenCalledWith(action.id);
  });

  it("calls onToggleFocus when star clicked", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Focus Test" });
    const action = makeAction({
      name: "Focusable",
      projectId: project.id,
      sequenceOrder: 1,
    });
    const onFocus = vi.fn();

    renderTree([project], [action], { onToggleFocus: onFocus });
    await user.click(screen.getByText("Focus Test"));

    const star = screen.getByRole("button", { name: /focus focusable/i });
    await user.click(star);
    expect(onFocus).toHaveBeenCalledWith(action.id);
  });

  it("calls onAddAction via rapid entry", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Add Test" });
    const onAdd = vi.fn();

    renderTree([project], [], { onAddAction: onAdd });
    await user.click(screen.getByText("Add Test"));

    const input = screen.getByPlaceholderText(/add action/i);
    await user.type(input, "New action{Enter}");
    expect(onAdd).toHaveBeenCalledWith(project.id, "New action");
  });

  it("shows stalled indicator for project with no incomplete actions", () => {
    const project = makeProject({ name: "Stalled Project" });

    renderTree([project], []);
    // Stalled indicator should be visible on the project row
    const row = screen
      .getByText("Stalled Project")
      .closest("[data-project-id]")! as HTMLElement;
    expect(within(row).getByLabelText("Needs next action")).toBeInTheDocument();
  });

  it("disclosure arrow rotates when expanded", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Arrow Test" });
    const action = makeAction({
      name: "Some task",
      projectId: project.id,
    });

    renderTree([project], [action]);
    const toggle = screen.getByLabelText("Expand Arrow Test");
    expect(toggle.querySelector(".rotate-90")).toBeNull();

    await user.click(toggle);
    expect(toggle.querySelector(".rotate-90")).not.toBeNull();
  });

  it("shows action count per project", () => {
    const project = makeProject({ name: "Counted" });
    const a1 = makeAction({
      name: "One",
      projectId: project.id,
    });
    const a2 = makeAction({
      name: "Two",
      projectId: project.id,
    });

    renderTree([project], [a1, a2]);
    const row = screen
      .getByText("Counted")
      .closest("[data-project-id]")! as HTMLElement;
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Show all projects toggle
  // -----------------------------------------------------------------------

  it("does not show toggle when all projects are active", () => {
    const p1 = makeProject({ name: "Active A" });
    const p2 = makeProject({ name: "Active B" });
    renderTree([p1, p2]);
    expect(
      screen.queryByLabelText("Show all projects"),
    ).not.toBeInTheDocument();
  });

  it("shows toggle when non-active projects exist", () => {
    const active = makeProject({ name: "Active" });
    const completed = makeProject({ name: "Done", status: "completed" });
    renderTree([active, completed]);
    expect(screen.getByLabelText("Show all projects")).toBeInTheDocument();
  });

  it("shows non-active projects after clicking toggle", async () => {
    const user = userEvent.setup();
    const active = makeProject({ name: "Active Project" });
    const completed = makeProject({
      name: "Completed Project",
      status: "completed",
    });
    const onHold = makeProject({
      name: "On Hold Project",
      status: "on-hold",
    });
    renderTree([active, completed, onHold]);

    expect(screen.queryByText("Completed Project")).not.toBeInTheDocument();
    expect(screen.queryByText("On Hold Project")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Show all projects"));

    expect(screen.getByText("Completed Project")).toBeInTheDocument();
    expect(screen.getByText("On Hold Project")).toBeInTheDocument();
    expect(screen.getByText("2 inactive")).toBeInTheDocument();
    expect(screen.getByText("(+2 inactive)")).toBeInTheDocument();
  });

  it("shows status badges on non-active projects", async () => {
    const user = userEvent.setup();
    const active = makeProject({ name: "Active" });
    const completed = makeProject({
      name: "Done Proj",
      status: "completed",
    });
    renderTree([active, completed]);

    await user.click(screen.getByLabelText("Show all projects"));

    const row = screen
      .getByText("Done Proj")
      .closest("[data-project-id]")! as HTMLElement;
    expect(within(row).getByText("completed")).toBeInTheDocument();
  });

  it("hides non-active projects after toggling off", async () => {
    const user = userEvent.setup();
    const active = makeProject({ name: "Active" });
    const completed = makeProject({
      name: "Completed",
      status: "completed",
    });
    renderTree([active, completed]);

    await user.click(screen.getByLabelText("Show all projects"));
    expect(screen.getByText("Completed")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Show active only"));
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("calls onToggleFocus with project ID when star clicked on project header", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Starrable Project" });
    const onFocus = vi.fn();

    renderTree([project], [], { onToggleFocus: onFocus });

    const star = screen.getByRole("button", {
      name: /star starrable project/i,
    });
    await user.click(star);
    expect(onFocus).toHaveBeenCalledWith(project.id);
  });

  it("shows filled star when project is focused", () => {
    const project = makeProject({ name: "Starred Project", isFocused: true });
    renderTree([project]);

    expect(
      screen.getByRole("button", { name: /unstar starred project/i }),
    ).toBeInTheDocument();
  });

  it("shows outline star when project is not focused", () => {
    const project = makeProject({
      name: "Unstarred Project",
      isFocused: false,
    });
    renderTree([project]);

    expect(
      screen.getByRole("button", { name: /star unstarred project/i }),
    ).toBeInTheDocument();
  });

  it("shows desired outcome when expanded", async () => {
    const user = userEvent.setup();
    const project = makeProject({
      name: "Outcome Test",
      desiredOutcome: "Website fully live and indexed",
    });

    renderTree([project], []);
    await user.click(screen.getByText("Outcome Test"));
    expect(
      screen.getByText("Website fully live and indexed"),
    ).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Project rename
  // -----------------------------------------------------------------------

  it("enters edit mode on double-click when expanded", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Rename Me" });
    const onUpdateTitle = vi.fn();

    renderTree([project], [], { onUpdateTitle });

    // First click to expand
    await user.click(screen.getByText("Rename Me"));
    // Double-click the name to enter edit mode
    await user.dblClick(screen.getByText("Rename Me"));
    expect(screen.getByDisplayValue("Rename Me")).toBeInTheDocument();
  });

  it("does not enter edit mode on double-click when collapsed", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Stay Collapsed" });
    const onUpdateTitle = vi.fn();

    renderTree([project], [], { onUpdateTitle });

    // Double-click on collapsed project — should just toggle expand (via click events)
    await user.dblClick(screen.getByText("Stay Collapsed"));
    // Should not be in edit mode (no textarea)
    expect(
      screen.queryByDisplayValue("Stay Collapsed"),
    ).not.toBeInTheDocument();
  });

  it("saves renamed project on Enter", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Old Name" });
    const onUpdateTitle = vi.fn();

    renderTree([project], [], { onUpdateTitle });

    // Expand, then double-click to edit
    await user.click(screen.getByText("Old Name"));
    await user.dblClick(screen.getByText("Old Name"));

    const textarea = screen.getByDisplayValue("Old Name");
    await user.clear(textarea);
    await user.type(textarea, "New Name{Enter}");
    expect(onUpdateTitle).toHaveBeenCalledWith(project.id, "New Name");
  });

  it("cancels rename on Escape", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Keep This" });
    const onUpdateTitle = vi.fn();

    renderTree([project], [], { onUpdateTitle });

    await user.click(screen.getByText("Keep This"));
    await user.dblClick(screen.getByText("Keep This"));

    const textarea = screen.getByDisplayValue("Keep This");
    await user.clear(textarea);
    await user.type(textarea, "Nope{Escape}");
    expect(onUpdateTitle).not.toHaveBeenCalled();
  });

  it("does not enter edit mode when onUpdateTitle is not provided", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "No Edit" });

    renderTree([project], []); // no onUpdateTitle

    await user.click(screen.getByText("No Edit"));
    await user.dblClick(screen.getByText("No Edit"));
    expect(screen.queryByDisplayValue("No Edit")).not.toBeInTheDocument();
  });
});
