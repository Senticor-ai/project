import { useRef, useEffect } from "react";
import { useToast } from "@/lib/use-toast";
import type { ImportJobData } from "@/components/settings/ImportJobRow";

export function useImportJobToasts(jobs: ImportJobData[]) {
  const { toast } = useToast();
  const prevStatuses = useRef(new Map<string, string>());

  useEffect(() => {
    const prev = prevStatuses.current;
    const next = new Map<string, string>();

    for (const job of jobs) {
      next.set(job.job_id, job.status);
      const oldStatus = prev.get(job.job_id);

      // Only fire on transitions from active → terminal
      if (oldStatus && (oldStatus === "queued" || oldStatus === "running")) {
        if (job.status === "completed" && job.summary) {
          toast(
            `Import complete — ${job.summary.created} created, ${job.summary.updated} updated`,
            "success",
          );
        } else if (job.status === "failed") {
          toast(`Import failed${job.error ? ` — ${job.error}` : ""}`, "error");
        }
      }
    }

    prevStatuses.current = next;
  }, [jobs, toast]);
}
