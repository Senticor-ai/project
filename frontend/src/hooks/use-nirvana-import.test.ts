import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ImportsApi, FilesApi } from "@/lib/api-client";
import type {
  NirvanaImportSummary,
  ImportJobResponse,
  FileRecord,
} from "@/lib/api-client";
import { useNirvanaImport } from "./use-nirvana-import";

vi.mock("@/lib/api-client", () => ({
  FilesApi: {
    initiate: vi.fn(),
    uploadChunk: vi.fn(),
    complete: vi.fn(),
  },
  ImportsApi: {
    inspectNirvana: vi.fn(),
    importNirvanaFromFile: vi.fn(),
    getJob: vi.fn(),
  },
}));

const mockedImports = vi.mocked(ImportsApi);
const mockedFiles = vi.mocked(FilesApi);

const SUMMARY: NirvanaImportSummary = {
  total: 100,
  created: 80,
  updated: 10,
  skipped: 5,
  errors: 5,
  bucket_counts: { inbox: 10, next: 60, waiting: 5, someday: 5, reference: 20 },
  sample_errors: ["item[42] missing name"],
};

const FILE_RECORD: FileRecord = {
  file_id: "file-abc",
  original_name: "export.json",
  content_type: "application/json",
  size_bytes: 500,
  sha256: "abc",
  created_at: "2026-02-06T12:00:00Z",
  download_url: "/files/file-abc",
};

const JOB_QUEUED: ImportJobResponse = {
  job_id: "job-1",
  status: "queued",
  file_id: "file-abc",
  file_sha256: null,
  source: "nirvana",
  created_at: "2026-02-06T12:00:00Z",
  updated_at: "2026-02-06T12:00:00Z",
  started_at: null,
  finished_at: null,
  summary: null,
  error: null,
};

const JOB_COMPLETED: ImportJobResponse = {
  ...JOB_QUEUED,
  status: "completed",
  finished_at: "2026-02-06T12:01:00Z",
  summary: SUMMARY,
};

const JOB_FAILED: ImportJobResponse = {
  ...JOB_QUEUED,
  status: "failed",
  finished_at: "2026-02-06T12:01:00Z",
  error: "Database connection lost",
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useNirvanaImport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: upload succeeds
    mockedFiles.initiate.mockResolvedValue({
      upload_id: "up-1",
      upload_url: "/files/upload/up-1",
      chunk_size: 10000,
      chunk_total: 1,
      expires_at: "2026-02-07T00:00:00Z",
    });
    mockedFiles.uploadChunk.mockResolvedValue({ received: 500 });
    mockedFiles.complete.mockResolvedValue(FILE_RECORD);
  });

  it("inspect calls API with file_id and returns summary", async () => {
    mockedImports.inspectNirvana.mockResolvedValue(SUMMARY);

    const { result } = renderHook(() => useNirvanaImport(), {
      wrapper: createWrapper(),
    });

    let summary: NirvanaImportSummary | undefined;
    await act(async () => {
      summary = await result.current.inspect.mutateAsync({
        fileId: "file-abc",
        includeCompleted: true,
      });
    });

    expect(mockedImports.inspectNirvana).toHaveBeenCalledWith({
      file_id: "file-abc",
      include_completed: true,
    });
    expect(summary).toEqual(SUMMARY);
  });

  it("inspect passes includeCompleted=false when toggled", async () => {
    mockedImports.inspectNirvana.mockResolvedValue(SUMMARY);

    const { result } = renderHook(() => useNirvanaImport(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.inspect.mutateAsync({
        fileId: "file-abc",
        includeCompleted: false,
      });
    });

    expect(mockedImports.inspectNirvana).toHaveBeenCalledWith({
      file_id: "file-abc",
      include_completed: false,
    });
  });

  it("startImport calls from-file API and returns job", async () => {
    mockedImports.importNirvanaFromFile.mockResolvedValue(JOB_QUEUED);

    const { result } = renderHook(() => useNirvanaImport(), {
      wrapper: createWrapper(),
    });

    let job: ImportJobResponse | undefined;
    await act(async () => {
      job = await result.current.startImport.mutateAsync({
        fileId: "file-abc",
        includeCompleted: true,
      });
    });

    expect(mockedImports.importNirvanaFromFile).toHaveBeenCalledWith({
      file_id: "file-abc",
      include_completed: true,
    });
    expect(job?.job_id).toBe("job-1");
    expect(job?.status).toBe("queued");
  });

  it("pollJob fetches job status", async () => {
    mockedImports.getJob.mockResolvedValue(JOB_COMPLETED);

    const { result } = renderHook(() => useNirvanaImport(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setJobId("job-1");
    });

    await waitFor(() => {
      expect(result.current.job.data).toEqual(JOB_COMPLETED);
    });

    expect(mockedImports.getJob).toHaveBeenCalledWith("job-1");
  });

  it("pollJob is disabled when jobId is null", () => {
    const { result } = renderHook(() => useNirvanaImport(), {
      wrapper: createWrapper(),
    });

    expect(result.current.job.isFetching).toBe(false);
    expect(mockedImports.getJob).not.toHaveBeenCalled();
  });

  it("upload delegates to useFileUpload and returns file record", async () => {
    const file = new File(["test"], "export.json", {
      type: "application/json",
    });

    const { result } = renderHook(() => useNirvanaImport(), {
      wrapper: createWrapper(),
    });

    let record: FileRecord | undefined;
    await act(async () => {
      record = await result.current.upload.mutateAsync(file);
    });

    expect(record?.file_id).toBe("file-abc");
    expect(mockedFiles.complete).toHaveBeenCalled();
  });

  it("handles inspect API errors", async () => {
    mockedImports.inspectNirvana.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => useNirvanaImport(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.inspect.mutateAsync({
        fileId: "file-abc",
        includeCompleted: true,
      }),
    ).rejects.toThrow("Server error");
  });

  it("exposes failed job error", async () => {
    mockedImports.getJob.mockResolvedValue(JOB_FAILED);

    const { result } = renderHook(() => useNirvanaImport(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setJobId("job-1");
    });

    await waitFor(() => {
      expect(result.current.job.data?.status).toBe("failed");
    });

    expect(result.current.job.data?.error).toBe("Database connection lost");
  });
});

// ---------------------------------------------------------------------------
// Running status invalidation
// ---------------------------------------------------------------------------

describe("useNirvanaImport running invalidation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createWrapperWithClient() {
    const qc = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false, refetchOnWindowFocus: false },
      },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    return { wrapper, qc };
  }

  it("invalidates things queries when job status is running", async () => {
    const JOB_RUNNING: ImportJobResponse = {
      ...JOB_QUEUED,
      status: "running",
      started_at: "2026-02-06T12:00:01Z",
    };
    mockedImports.getJob.mockResolvedValue(JOB_RUNNING);

    const { wrapper, qc } = createWrapperWithClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useNirvanaImport(), { wrapper });

    await act(async () => {
      result.current.setJobId("job-1");
    });

    // Wait for the job query to resolve
    await waitFor(() => {
      expect(result.current.job.data?.status).toBe("running");
    });

    // The effect fires immediately when status becomes "running"
    expect(spy).toHaveBeenCalled();

    // Advance timer to trigger interval
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    // Should have additional calls from the interval
    const thingsInvalidations = spy.mock.calls.filter(
      (call) => JSON.stringify(call[0]?.queryKey) === JSON.stringify(["items"]),
    );
    expect(thingsInvalidations.length).toBeGreaterThanOrEqual(2);
  });

  it("invalidates things once on completed status (guard)", async () => {
    mockedImports.getJob.mockResolvedValue(JOB_COMPLETED);

    const { wrapper, qc } = createWrapperWithClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useNirvanaImport(), { wrapper });

    await act(async () => {
      result.current.setJobId("job-1");
    });

    await waitFor(() => {
      expect(result.current.job.data?.status).toBe("completed");
    });

    // Record the number of things invalidations after completion
    const afterFirst = spy.mock.calls.filter(
      (call) => JSON.stringify(call[0]?.queryKey) === JSON.stringify(["items"]),
    ).length;
    expect(afterFirst).toBeGreaterThanOrEqual(1);

    // Force a re-render — the guard should prevent additional invalidation
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    const afterSecond = spy.mock.calls.filter(
      (call) => JSON.stringify(call[0]?.queryKey) === JSON.stringify(["items"]),
    ).length;

    // No additional things invalidation beyond the first
    expect(afterSecond).toBe(afterFirst);
  });

  it("does not set running interval for failed status", async () => {
    mockedImports.getJob.mockResolvedValue(JOB_FAILED);

    const { wrapper, qc } = createWrapperWithClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useNirvanaImport(), { wrapper });

    await act(async () => {
      result.current.setJobId("job-1");
    });

    await waitFor(() => {
      expect(result.current.job.data?.status).toBe("failed");
    });

    const callsBefore = spy.mock.calls.length;

    // Advance timer — no interval should fire
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // No additional calls from interval
    expect(spy.mock.calls.length).toBe(callsBefore);
  });
});
