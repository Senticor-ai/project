import { describe, it, expect, beforeEach } from "vitest";
import {
  createAction,
  createProject,
  resetFactoryCounter,
} from "@/model/factories";
import {
  getProjectActions,
  getNextActionId,
  isProjectStalled,
} from "./project-utils";

beforeEach(() => resetFactoryCounter());

describe("getProjectActions", () => {
  it("returns actions belonging to the project, sorted by sequenceOrder", () => {
    const project = createProject({
      name: "Website Redesign",
      desiredOutcome: "New website live",
    });
    const a1 = createAction({
      name: "Design wireframes",
      projectId: project.id,
      sequenceOrder: 2,
    });
    const a2 = createAction({
      name: "Write copy",
      projectId: project.id,
      sequenceOrder: 1,
    });
    const a3 = createAction({ name: "Unrelated task" });

    const result = getProjectActions(project, [a1, a2, a3]);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("Write copy");
    expect(result[1]?.name).toBe("Design wireframes");
  });

  it("returns empty array when no actions belong to the project", () => {
    const project = createProject({
      name: "Empty project",
      desiredOutcome: "TBD",
    });
    const a1 = createAction({ name: "Unrelated" });

    expect(getProjectActions(project, [a1])).toEqual([]);
  });

  it("sorts actions without sequenceOrder after those with", () => {
    const project = createProject({
      name: "Mixed",
      desiredOutcome: "Done",
    });
    const a1 = createAction({
      name: "Ordered",
      projectId: project.id,
      sequenceOrder: 1,
    });
    const a2 = createAction({
      name: "Unordered",
      projectId: project.id,
    });

    const result = getProjectActions(project, [a2, a1]);
    expect(result[0]?.name).toBe("Ordered");
    expect(result[1]?.name).toBe("Unordered");
  });
});

describe("getNextActionId", () => {
  it("returns the first incomplete action ID", () => {
    const a1 = createAction({
      name: "Done",
      completedAt: new Date().toISOString(),
      sequenceOrder: 1,
    });
    const a2 = createAction({ name: "Next", sequenceOrder: 2 });
    const a3 = createAction({ name: "Future", sequenceOrder: 3 });

    // Actions should already be sorted by sequenceOrder
    expect(getNextActionId([a1, a2, a3])).toBe(a2.id);
  });

  it("returns null when all actions are completed", () => {
    const a1 = createAction({
      name: "Done 1",
      completedAt: new Date().toISOString(),
    });
    const a2 = createAction({
      name: "Done 2",
      completedAt: new Date().toISOString(),
    });

    expect(getNextActionId([a1, a2])).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(getNextActionId([])).toBeNull();
  });

  it("returns first action when none are completed", () => {
    const a1 = createAction({ name: "First", sequenceOrder: 1 });
    const a2 = createAction({ name: "Second", sequenceOrder: 2 });

    expect(getNextActionId([a1, a2])).toBe(a1.id);
  });
});

describe("isProjectStalled", () => {
  it("returns true for active project with no actions", () => {
    const project = createProject({
      name: "Empty",
      desiredOutcome: "TBD",
      status: "active",
    });
    expect(isProjectStalled(project, [])).toBe(true);
  });

  it("returns true for active project where all actions are completed", () => {
    const project = createProject({
      name: "All done",
      desiredOutcome: "Done",
      status: "active",
    });
    const a1 = createAction({
      name: "Task",
      projectId: project.id,
      completedAt: new Date().toISOString(),
    });
    expect(isProjectStalled(project, [a1])).toBe(true);
  });

  it("returns false for active project with incomplete actions", () => {
    const project = createProject({
      name: "In progress",
      desiredOutcome: "Working",
      status: "active",
    });
    const a1 = createAction({
      name: "Active task",
      projectId: project.id,
    });
    expect(isProjectStalled(project, [a1])).toBe(false);
  });

  it("returns false for completed projects", () => {
    const project = createProject({
      name: "Completed",
      desiredOutcome: "Done",
      status: "completed",
    });
    expect(isProjectStalled(project, [])).toBe(false);
  });

  it("returns false for on-hold projects", () => {
    const project = createProject({
      name: "On hold",
      desiredOutcome: "Paused",
      status: "on-hold",
    });
    expect(isProjectStalled(project, [])).toBe(false);
  });
});
