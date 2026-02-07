import type { Thing, Project } from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";

/** Returns things belonging to a project, sorted by sequenceOrder. */
export function getProjectActions(
  project: Project,
  allThings: Thing[],
): Thing[] {
  return allThings
    .filter((t) => t.projectId === project.id)
    .sort(
      (a, b) => (a.sequenceOrder ?? Infinity) - (b.sequenceOrder ?? Infinity),
    );
}

/** Returns the ID of the next incomplete action (lowest sequenceOrder), or null. */
export function getNextActionId(sortedThings: Thing[]): CanonicalId | null {
  const next = sortedThings.find((t) => !t.completedAt);
  return next?.id ?? null;
}

/** Checks if a project is "stalled" (active but has no incomplete actions). */
export function isProjectStalled(
  project: Project,
  allThings: Thing[],
): boolean {
  if (project.status !== "active") return false;
  const projectThings = allThings.filter((t) => t.projectId === project.id);
  if (projectThings.length === 0) return true;
  return projectThings.every((t) => !!t.completedAt);
}
