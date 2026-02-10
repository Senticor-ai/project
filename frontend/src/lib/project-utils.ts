import type { ActionItem, Project } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

/** Returns things belonging to a project, sorted by sequenceOrder. */
export function getProjectActions(
  project: Project,
  allActionItems: ActionItem[],
): ActionItem[] {
  return allActionItems
    .filter((t) => t.projectIds.includes(project.id))
    .sort(
      (a, b) => (a.sequenceOrder ?? Infinity) - (b.sequenceOrder ?? Infinity),
    );
}

/** Returns the ID of the next incomplete action (lowest sequenceOrder), or null. */
export function getNextActionId(
  sortedActionItems: ActionItem[],
): CanonicalId | null {
  const next = sortedActionItems.find((t) => !t.completedAt);
  return next?.id ?? null;
}

/** Checks if a project is "stalled" (active but has no incomplete actions). */
export function isProjectStalled(
  project: Project,
  allActionItems: ActionItem[],
): boolean {
  if (project.status !== "active") return false;
  const projectActionItems = allActionItems.filter((t) =>
    t.projectIds.includes(project.id),
  );
  if (projectActionItems.length === 0) return true;
  return projectActionItems.every((t) => !!t.completedAt);
}
