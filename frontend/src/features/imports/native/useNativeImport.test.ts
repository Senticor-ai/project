import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ImportsApi, FilesApi } from "@/lib/api-client";
import type {
  ImportSummary,
  ImportJobResponse,
  FileRecord,
} from "@/lib/api-client";
import { useNativeImport } from "./useNativeImport";

vi.mock("@/lib/api-client", () => ({
  FilesApi: {
    initiate: vi.fn(),
    uploadChunk: vi.fn(),
    complete: vi.fn(),
  },
  ImportsApi: {
    inspectNative: vi.fn(),
    importNativeFromFile: vi.fn(),
    getJob: vi.fn(),
  },
}));

const mockedImports = vi.mocked(ImportsApi);
const mockedFiles = vi.mocked(FilesApi);

const SUMMARY: ImportSummary = {
  total: 50,
  created: 40,
  updated: 5,
  skipped: 3,
  errors: 2,
  bucket_counts: { inbox: 8, next: 30, waiting: 4, someday: 3, reference: 5 },
  sample_errors: ["item[7] missing name"],
};

const FILE_RECORD: FileRecord = {
  file_id: "file-abc",
  original_name: "export.json",
  content_type: "application/json",
  size_bytes: 1200,
  sha256: "def",
  created_at: "2026-02-06T12:00:00Z",
  download_url: "/files/file-abc",
};

const JOB_QUEUED: ImportJobResponse = {
  job_id: "job-1",
  status: "queued",
  file_id: "file-abc",
  file_sha256: null,
  source: "native",
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

describe("useNativeImport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedFiles.initiate.mockResolvedValue({
      upload_id: "up-1",
      upload_url: "/files/upload/up-1",
      chunk_size: 10000,
      chunk_total: 1,
      expires_at: "2026-02-07T00:00:00Z",
    });
    mockedFiles.uploadChunk.mockResolvedValue({ received: 1200 });
    mockedFiles.complete.mockResolvedValue(FILE_RECORD);
  });

  it("inspect calls ImportsApi.inspectNative", async () => {
    mockedImports.inspectNative.mockResolvedValue(SUMMARY);

    const { result } = renderHook(() => useNativeImport(), {
      wrapper: createWrapper(),
    });

    let summary: ImportSummary | undefined;
    await act(async () => {
      summary = await result.current.inspect.mutateAsync({
        fileId: "file-abc",
        includeCompleted: true,
      });
    });

    expect(mockedImports.inspectNative).toHaveBeenCalledWith({
      file_id: "file-abc",
      include_completed: true,
    });
    expect(summary).toEqual(SUMMARY);
  });

  it("startImport calls ImportsApi.importNativeFromFile", async () => {
    mockedImports.importNativeFromFile.mockResolvedValue(JOB_QUEUED);

    const { result } = renderHook(() => useNativeImport(), {
      wrapper: createWrapper(),
    });

    let job: ImportJobResponse | undefined;
    await act(async () => {
      job = await result.current.startImport.mutateAsync({
        fileId: "file-abc",
        includeCompleted: true,
      });
    });

    expect(mockedImports.importNativeFromFile).toHaveBeenCalledWith({
      file_id: "file-abc",
      include_completed: true,
    });
    expect(job?.job_id).toBe("job-1");
    expect(job?.status).toBe("queued");
  });

  it("pollJob uses shared ImportsApi.getJob", async () => {
    mockedImports.getJob.mockResolvedValue(JOB_COMPLETED);

    const { result } = renderHook(() => useNativeImport(), {
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

  it("upload delegates to useFileUpload", async () => {
    const file = new File(["test"], "export.json", {
      type: "application/json",
    });

    const { result } = renderHook(() => useNativeImport(), {
      wrapper: createWrapper(),
    });

    let record: FileRecord | undefined;
    await act(async () => {
      record = await result.current.upload.mutateAsync(file);
    });

    expect(record?.file_id).toBe("file-abc");
    expect(mockedFiles.complete).toHaveBeenCalled();
  });
});
