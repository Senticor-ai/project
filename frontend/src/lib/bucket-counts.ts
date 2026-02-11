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
  return {
    inbox: actionItems.filter((t) => t.bucket === "inbox" && !t.completedAt)
      .length,
    focus: actionItems.filter((t) => t.isFocused && !t.completedAt).length,
    next: actionItems.filter((t) => t.bucket === "next" && !t.completedAt)
      .length,
    waiting: actionItems.filter((t) => t.bucket === "waiting" && !t.completedAt)
      .length,
    calendar: actionItems.filter(
      (t) => t.bucket === "calendar" && !t.completedAt,
    ).length,
    someday: actionItems.filter((t) => t.bucket === "someday" && !t.completedAt)
      .length,
    reference: referenceItems.filter((r) => !r.provenance.archivedAt).length,
    project: projects.filter((p) => p.status === "active").length,
  };
}
