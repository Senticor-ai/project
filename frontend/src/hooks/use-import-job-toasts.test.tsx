import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { useImportJobToasts } from "./use-import-job-toasts";
import type { ImportJobData } from "@/components/settings/ImportJobRow";

const COMPLETED_JOB: ImportJobData = {
  job_id: "job-1",
  status: "completed",
  source: "nirvana",
  total: 100,
  created_at: "2026-02-06T12:00:00Z",
  started_at: "2026-02-06T12:00:01Z",
  finished_at: "2026-02-06T12:01:00Z",
  summary: { total: 100, created: 80, updated: 10, skipped: 5, errors: 5 },
  progress: null,
  error: null,
};

const RUNNING_JOB: ImportJobData = {
  ...COMPLETED_JOB,
  status: "running",
  finished_at: null,
  summary: null,
};

const FAILED_JOB: ImportJobData = {
  ...COMPLETED_JOB,
  status: "failed",
  error: "Worker timeout exceeded",
};

function Harness({ jobs }: { jobs: ImportJobData[] }) {
  useImportJobToasts(jobs);
  return null;
}

let qc: QueryClient;

function renderHarness(jobs: ImportJobData[]) {
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <Harness jobs={jobs} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

describe("useImportJobToasts", () => {
  it("does not fire toast on initial render with completed jobs", () => {
    renderHarness([COMPLETED_JOB]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fires success toast when job transitions from running to completed", () => {
    const { rerender } = renderHarness([RUNNING_JOB]);

    // Transition to completed
    rerender(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <Harness jobs={[COMPLETED_JOB]} />
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Import complete — 80 created, 10 updated",
    );
  });

  it("fires error toast when job transitions from running to failed", () => {
    const { rerender } = renderHarness([RUNNING_JOB]);

    rerender(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <Harness jobs={[FAILED_JOB]} />
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Import failed — Worker timeout exceeded",
    );
  });

  it("does not fire toast when job stays running", () => {
    const { rerender } = renderHarness([RUNNING_JOB]);

    // Re-render with same status
    rerender(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <Harness jobs={[RUNNING_JOB]} />
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fires toast when job transitions from queued to completed", () => {
    const QUEUED_JOB: ImportJobData = {
      ...RUNNING_JOB,
      status: "queued",
    };
    const { rerender } = renderHarness([QUEUED_JOB]);

    rerender(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <Harness jobs={[COMPLETED_JOB]} />
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Import complete");
  });
});
