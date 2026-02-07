import type { Action, Project } from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";

/** Returns actions belonging to a project, sorted by sequenceOrder. */
export function getProjectActions(
  project: Project,
  allActions: Action[],
): Action[] {
  return allActions
    .filter((a) => a.projectId === project.id)
    .sort(
      (a, b) => (a.sequenceOrder ?? Infinity) - (b.sequenceOrder ?? Infinity),
    );
}

/** Returns the ID of the next incomplete action (lowest sequenceOrder), or null. */
export function getNextActionId(sortedActions: Action[]): CanonicalId | null {
  const next = sortedActions.find((a) => !a.completedAt);
  return next?.id ?? null;
}

/** Checks if a project is "stalled" (active but has no incomplete actions). */
export function isProjectStalled(
  project: Project,
  allActions: Action[],
): boolean {
  if (project.status !== "active") return false;
  const projectActions = allActions.filter((a) => a.projectId === project.id);
  if (projectActions.length === 0) return true;
  return projectActions.every((a) => !!a.completedAt);
}
