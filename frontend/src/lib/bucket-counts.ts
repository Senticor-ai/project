import type {
  ActionItem,
  Bucket,
  Project,
  ReferenceMaterial,
} from "@/model/types";

export function computeBucketCounts(
  actionItems: ActionItem[],
  referenceItems: ReferenceMaterial[],
  projects: Project[],
): Partial<Record<Bucket, number>> {
  const isStandalone = (t: ActionItem) => t.projectIds.length === 0;
  return {
    inbox: actionItems.filter((t) => t.bucket === "inbox" && !t.completedAt)
      .length,
    focus: actionItems.filter((t) => t.isFocused && !t.completedAt).length,
    next: actionItems.filter(
      (t) => t.bucket === "next" && !t.completedAt && isStandalone(t),
    ).length,
    waiting: actionItems.filter(
      (t) => t.bucket === "waiting" && !t.completedAt && isStandalone(t),
    ).length,
    calendar: actionItems.filter(
      (t) => t.bucket === "calendar" && !t.completedAt && isStandalone(t),
    ).length,
    someday: actionItems.filter(
      (t) => t.bucket === "someday" && !t.completedAt && isStandalone(t),
    ).length,
    reference: referenceItems.filter((r) => !r.provenance.archivedAt).length,
    project: projects.filter((p) => p.status === "active").length,
  };
}
