import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ImportsApi, FilesApi } from "@/lib/api-client";
import type {
  ImportSummary,
  ImportJobResponse,
  FileRecord,
} from "@/lib/api-client";
import { useImportSource } from "./useImportSource";
import type { ImportSourceConfig } from "./types";

vi.mock("@/lib/api-client", () => ({
  FilesApi: {
    initiate: vi.fn(),
    uploadChunk: vi.fn(),
    complete: vi.fn(),
  },
  ImportsApi: {
    getJob: vi.fn(),
  },
}));

const mockedImports = vi.mocked(ImportsApi);
const mockedFiles = vi.mocked(FilesApi);

const SUMMARY: ImportSummary = {
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
  source: "test",
  created_at: "2026-02-06T12:00:00Z",
  updated_at: "2026-02-06T12:00:00Z",
  started_at: null,
  finished_at: null,
  summary: null,
  progress: null,
  error: null,
  archived_at: null,
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

function createConfig(
  overrides: Partial<ImportSourceConfig> = {},
): ImportSourceConfig {
  return {
    sourceId: "test",
    title: "Test Import",
    description: "Test description",
    dropLabel: "Drop test file",
    fileTestId: "test-file-input",
    inspectFn: vi.fn().mockResolvedValue(SUMMARY),
    importFn: vi.fn().mockResolvedValue(JOB_QUEUED),
    ...overrides,
  };
}

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

describe("useImportSource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

  it("inspect calls config.inspectFn with correct params", async () => {
    const config = createConfig();

    const { result } = renderHook(() => useImportSource(config), {
      wrapper: createWrapper(),
    });

    let summary: ImportSummary | undefined;
    await act(async () => {
      summary = await result.current.inspect.mutateAsync({
        fileId: "file-abc",
        includeCompleted: true,
      });
    });

    expect(config.inspectFn).toHaveBeenCalledWith({
      file_id: "file-abc",
      include_completed: true,
    });
    expect(summary).toEqual(SUMMARY);
  });

  it("inspect passes includeCompleted=false", async () => {
    const config = createConfig();

    const { result } = renderHook(() => useImportSource(config), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.inspect.mutateAsync({
        fileId: "file-abc",
        includeCompleted: false,
      });
    });

    expect(config.inspectFn).toHaveBeenCalledWith({
      file_id: "file-abc",
      include_completed: false,
    });
  });

  it("startImport calls config.importFn and returns job", async () => {
    const config = createConfig();

    const { result } = renderHook(() => useImportSource(config), {
      wrapper: createWrapper(),
    });

    let job: ImportJobResponse | undefined;
    await act(async () => {
      job = await result.current.startImport.mutateAsync({
        fileId: "file-abc",
        includeCompleted: true,
      });
    });

    expect(config.importFn).toHaveBeenCalledWith({
      file_id: "file-abc",
      include_completed: true,
    });
    expect(job?.job_id).toBe("job-1");
    expect(job?.status).toBe("queued");
  });

  it("pollJob fetches job status when jobId is set", async () => {
    const config = createConfig();
    mockedImports.getJob.mockResolvedValue(JOB_COMPLETED);

    const { result } = renderHook(() => useImportSource(config), {
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
    const config = createConfig();

    const { result } = renderHook(() => useImportSource(config), {
      wrapper: createWrapper(),
    });

    expect(result.current.job.isFetching).toBe(false);
    expect(mockedImports.getJob).not.toHaveBeenCalled();
  });

  it("upload delegates to useFileUpload and returns file record", async () => {
    const config = createConfig();
    const file = new File(["test"], "export.json", {
      type: "application/json",
    });

    const { result } = renderHook(() => useImportSource(config), {
      wrapper: createWrapper(),
    });

    let record: FileRecord | undefined;
    await act(async () => {
      record = await result.current.upload.mutateAsync(file);
    });

    expect(record?.file_id).toBe("file-abc");
    expect(mockedFiles.complete).toHaveBeenCalled();
  });

  it("handles inspect errors", async () => {
    const config = createConfig({
      inspectFn: vi.fn().mockRejectedValue(new Error("Server error")),
    });

    const { result } = renderHook(() => useImportSource(config), {
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
    const config = createConfig();
    mockedImports.getJob.mockResolvedValue(JOB_FAILED);

    const { result } = renderHook(() => useImportSource(config), {
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

describe("useImportSource running invalidation", () => {
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

  it("invalidates items queries when job status is running", async () => {
    const config = createConfig();
    const JOB_RUNNING: ImportJobResponse = {
      ...JOB_QUEUED,
      status: "running",
      started_at: "2026-02-06T12:00:01Z",
    };
    mockedImports.getJob.mockResolvedValue(JOB_RUNNING);

    const { wrapper, qc } = createWrapperWithClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useImportSource(config), { wrapper });

    await act(async () => {
      result.current.setJobId("job-1");
    });

    await waitFor(() => {
      expect(result.current.job.data?.status).toBe("running");
    });

    expect(spy).toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    const itemsInvalidations = spy.mock.calls.filter(
      (call) => JSON.stringify(call[0]?.queryKey) === JSON.stringify(["items"]),
    );
    expect(itemsInvalidations.length).toBeGreaterThanOrEqual(2);
  });

  it("invalidates items once on completed status (guard)", async () => {
    const config = createConfig();
    mockedImports.getJob.mockResolvedValue(JOB_COMPLETED);

    const { wrapper, qc } = createWrapperWithClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useImportSource(config), { wrapper });

    await act(async () => {
      result.current.setJobId("job-1");
    });

    await waitFor(() => {
      expect(result.current.job.data?.status).toBe("completed");
    });

    const afterFirst = spy.mock.calls.filter(
      (call) => JSON.stringify(call[0]?.queryKey) === JSON.stringify(["items"]),
    ).length;
    expect(afterFirst).toBeGreaterThanOrEqual(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    const afterSecond = spy.mock.calls.filter(
      (call) => JSON.stringify(call[0]?.queryKey) === JSON.stringify(["items"]),
    ).length;

    expect(afterSecond).toBe(afterFirst);
  });

  it("does not set running interval for failed status", async () => {
    const config = createConfig();
    mockedImports.getJob.mockResolvedValue(JOB_FAILED);

    const { wrapper, qc } = createWrapperWithClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useImportSource(config), { wrapper });

    await act(async () => {
      result.current.setJobId("job-1");
    });

    await waitFor(() => {
      expect(result.current.job.data?.status).toBe("failed");
    });

    const callsBefore = spy.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(spy.mock.calls.length).toBe(callsBefore);
  });
});
