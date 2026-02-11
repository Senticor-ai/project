import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ImportsApi } from "@/lib/api-client";
import type { ImportJobResponse } from "@/lib/api-client";
import { useImportJobs } from "./use-import-jobs";

vi.mock("@/lib/api-client", () => ({
  ImportsApi: {
    listJobs: vi.fn(),
    retryJob: vi.fn(),
    archiveJob: vi.fn(),
  },
}));

const mockedImports = vi.mocked(ImportsApi);

const COMPLETED_JOB: ImportJobResponse = {
  job_id: "job-1",
  status: "completed",
  file_id: "file-1",
  file_sha256: "abc123hash",
  source: "nirvana",
  created_at: "2025-06-15T10:00:00Z",
  updated_at: "2025-06-15T10:00:45Z",
  started_at: "2025-06-15T10:00:01Z",
  finished_at: "2025-06-15T10:00:45Z",
  summary: {
    total: 100,
    created: 90,
    updated: 5,
    skipped: 3,
    errors: 2,
    bucket_counts: { inbox: 50, next: 30, project: 20 },
    sample_errors: [],
  },
  progress: null,
  error: null,
  archived_at: null,
};

const RUNNING_JOB: ImportJobResponse = {
  job_id: "job-2",
  status: "running",
  file_id: "file-2",
  file_sha256: "def456hash",
  source: "nirvana",
  created_at: "2025-06-16T11:00:00Z",
  updated_at: "2025-06-16T11:00:02Z",
  started_at: "2025-06-16T11:00:02Z",
  finished_at: null,
  summary: null,
  progress: null,
  error: null,
  archived_at: null,
};

const QUEUED_JOB: ImportJobResponse = {
  job_id: "job-3",
  status: "queued",
  file_id: "file-3",
  file_sha256: "ghi789hash",
  source: "native",
  created_at: "2025-06-17T09:00:00Z",
  updated_at: "2025-06-17T09:00:00Z",
  started_at: null,
  finished_at: null,
  summary: null,
  progress: null,
  error: null,
  archived_at: null,
};

const FAILED_JOB: ImportJobResponse = {
  job_id: "job-4",
  status: "failed",
  file_id: "file-4",
  file_sha256: "jkl012hash",
  source: "nirvana",
  created_at: "2025-06-18T08:00:00Z",
  updated_at: "2025-06-18T08:01:00Z",
  started_at: "2025-06-18T08:00:01Z",
  finished_at: "2025-06-18T08:01:00Z",
  summary: null,
  progress: null,
  error: "Parse error at line 42",
  archived_at: null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useImportJobs", () => {
  it("fetches and transforms import jobs", async () => {
    mockedImports.listJobs.mockResolvedValue([COMPLETED_JOB]);

    const { result } = renderHook(() => useImportJobs(), { wrapper });

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(1);
    });

    expect(result.current.jobs[0]).toMatchObject({
      job_id: "job-1",
      status: "completed",
      source: "nirvana",
      total: 100,
    });
  });

  it("returns empty array while loading", () => {
    mockedImports.listJobs.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useImportJobs(), { wrapper });

    expect(result.current.jobs).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it("checkDuplicate finds matching sha256", async () => {
    mockedImports.listJobs.mockResolvedValue([COMPLETED_JOB, RUNNING_JOB]);

    const { result } = renderHook(() => useImportJobs(), { wrapper });

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(2);
    });

    const dup = result.current.checkDuplicate("abc123hash");
    expect(dup).toEqual({
      job_id: "job-1",
      status: "completed",
      total: 100,
      created_at: "2025-06-15T10:00:00Z",
    });
  });

  it("checkDuplicate returns null for unknown hash", async () => {
    mockedImports.listJobs.mockResolvedValue([COMPLETED_JOB]);

    const { result } = renderHook(() => useImportJobs(), { wrapper });

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(1);
    });

    expect(result.current.checkDuplicate("unknown-hash")).toBeNull();
  });

  it("checkDuplicate returns null when no data loaded", () => {
    mockedImports.listJobs.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useImportJobs(), { wrapper });

    expect(result.current.checkDuplicate("abc123hash")).toBeNull();
  });

  it("retryJob calls ImportsApi.retryJob", async () => {
    mockedImports.listJobs.mockResolvedValue([COMPLETED_JOB]);
    mockedImports.retryJob.mockResolvedValue({
      ...COMPLETED_JOB,
      job_id: "job-new",
      status: "queued",
    });

    const { result } = renderHook(() => useImportJobs(), { wrapper });
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));

    await act(async () => {
      await result.current.retryJob.mutateAsync("job-1");
    });

    expect(mockedImports.retryJob).toHaveBeenCalledWith("job-1");
  });

  it("archiveJob calls ImportsApi.archiveJob", async () => {
    mockedImports.listJobs.mockResolvedValue([COMPLETED_JOB]);
    mockedImports.archiveJob.mockResolvedValue({
      ...COMPLETED_JOB,
      archived_at: "2025-06-15T12:00:00Z",
    });

    const { result } = renderHook(() => useImportJobs(), { wrapper });
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));

    await act(async () => {
      await result.current.archiveJob.mutateAsync("job-1");
    });

    expect(mockedImports.archiveJob).toHaveBeenCalledWith("job-1");
  });
});

// ---------------------------------------------------------------------------
// Polling / refetchInterval
// ---------------------------------------------------------------------------

describe("useImportJobs polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls every 5s when a job is running", async () => {
    mockedImports.listJobs.mockResolvedValue([RUNNING_JOB]);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const timerWrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    renderHook(() => useImportJobs(), { wrapper: timerWrapper });

    // Wait for initial fetch
    await vi.waitFor(() => {
      expect(mockedImports.listJobs).toHaveBeenCalledTimes(1);
    });

    // Advance past the 5s refetch interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5500);
    });

    expect(mockedImports.listJobs.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("polls every 5s when a job is queued", async () => {
    mockedImports.listJobs.mockResolvedValue([QUEUED_JOB]);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const timerWrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    renderHook(() => useImportJobs(), { wrapper: timerWrapper });

    await vi.waitFor(() => {
      expect(mockedImports.listJobs).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5500);
    });

    expect(mockedImports.listJobs.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not poll when all jobs are completed or failed", async () => {
    mockedImports.listJobs.mockResolvedValue([COMPLETED_JOB, FAILED_JOB]);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const timerWrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    renderHook(() => useImportJobs(), { wrapper: timerWrapper });

    await vi.waitFor(() => {
      expect(mockedImports.listJobs).toHaveBeenCalledTimes(1);
    });

    const callsBeforeWait = mockedImports.listJobs.mock.calls.length;

    // Advance well past the refetch interval — should NOT trigger another fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(mockedImports.listJobs.mock.calls.length).toBe(callsBeforeWait);
  });
});
