import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImportsApi } from "@/lib/api-client";
import type { ImportJobResponse } from "@/lib/api-client";
import type { ImportJobData } from "@/components/settings/ImportJobRow";
import type { PreviousImport } from "@/components/settings/DuplicateImportWarning";

export const IMPORT_JOBS_QUERY_KEY = ["import-jobs"];

function toImportJobData(job: ImportJobResponse): ImportJobData {
  return {
    job_id: job.job_id,
    status: job.status as ImportJobData["status"],
    source: job.source,
    total: job.summary?.total ?? 0,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    summary: job.summary
      ? {
          total: job.summary.total,
          created: job.summary.created,
          updated: job.summary.updated,
          skipped: job.summary.skipped,
          errors: job.summary.errors,
        }
      : null,
    progress: job.progress ?? null,
    error: job.error,
  };
}

export function useImportJobs() {
  const query = useQuery<ImportJobResponse[]>({
    queryKey: IMPORT_JOBS_QUERY_KEY,
    queryFn: () => ImportsApi.listJobs({ limit: 20 }),
    staleTime: 30_000,
    refetchInterval: (q) => {
      // Poll while any job is active
      const hasActive = q.state.data?.some(
        (j) => j.status === "queued" || j.status === "running",
      );
      return hasActive ? 5000 : false;
    },
  });

  const jobs: ImportJobData[] = (query.data ?? []).map(toImportJobData);

  const checkDuplicate = useCallback(
    (sha256: string): PreviousImport | null => {
      if (!query.data) return null;
      const match = query.data.find((j) => j.file_sha256 === sha256);
      if (!match) return null;
      return {
        job_id: match.job_id,
        status: match.status,
        total: match.summary?.total ?? 0,
        created_at: match.created_at,
      };
    },
    [query.data],
  );

  return { jobs, checkDuplicate, isLoading: query.isLoading };
}
