import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImportsApi } from "@/lib/api-client";
import type { NirvanaImportSummary, ImportJobResponse } from "@/lib/api-client";
import { useFileUpload } from "./use-file-upload";
import { THINGS_QUERY_KEY } from "./use-things";

export function useNirvanaImport() {
  const qc = useQueryClient();
  const upload = useFileUpload();
  const [jobId, setJobId] = useState<string | null>(null);

  const inspect = useMutation<
    NirvanaImportSummary,
    Error,
    { fileId: string; includeCompleted: boolean }
  >({
    mutationFn: (params) =>
      ImportsApi.inspectNirvana({
        file_id: params.fileId,
        include_completed: params.includeCompleted,
      }),
  });

  const startImport = useMutation<
    ImportJobResponse,
    Error,
    { fileId: string; includeCompleted: boolean }
  >({
    mutationFn: (params) =>
      ImportsApi.importNirvanaFromFile({
        file_id: params.fileId,
        include_completed: params.includeCompleted,
      }),
  });

  const job = useQuery<ImportJobResponse>({
    queryKey: ["import-job", jobId],
    queryFn: () => ImportsApi.getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "queued" || status === "running") return 2000;
      return false;
    },
  });

  // Refresh things while import is running (items commit individually via
  // autocommit) and once more when the job completes.
  const jobStatus = job.data?.status;
  const hasCompletedInvalidation = useRef(false);

  useEffect(() => {
    if (jobStatus === "running") {
      // Periodically refetch so items appear incrementally
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
      const id = setInterval(() => {
        qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
      }, 3000);
      return () => clearInterval(id);
    }
    if (jobStatus === "completed" && !hasCompletedInvalidation.current) {
      hasCompletedInvalidation.current = true;
      qc.invalidateQueries({ queryKey: THINGS_QUERY_KEY });
    }
  }, [jobStatus, qc]);

  // Reset guard when a new import starts
  useEffect(() => {
    hasCompletedInvalidation.current = false;
  }, [jobId]);

  return { upload, inspect, startImport, job, jobId, setJobId };
}
