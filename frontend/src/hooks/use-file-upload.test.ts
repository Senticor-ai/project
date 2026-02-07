import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { FilesApi } from "@/lib/api-client";
import type { FileInitiateResponse, FileRecord } from "@/lib/api-client";
import { useFileUpload } from "./use-file-upload";

vi.mock("@/lib/api-client", () => ({
  FilesApi: {
    initiate: vi.fn(),
    uploadChunk: vi.fn(),
    complete: vi.fn(),
  },
}));

const mockedFiles = vi.mocked(FilesApi);

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const INITIATE_RESPONSE: FileInitiateResponse = {
  upload_id: "upload-123",
  upload_url: "/files/upload/upload-123",
  chunk_size: 1024,
  chunk_total: 2,
  expires_at: "2026-02-07T00:00:00Z",
};

const FILE_RECORD: FileRecord = {
  file_id: "file-abc",
  original_name: "export.json",
  content_type: "application/json",
  size_bytes: 2000,
  sha256: "abc123",
  created_at: "2026-02-06T12:00:00Z",
  download_url: "/files/file-abc",
};

describe("useFileUpload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedFiles.initiate.mockResolvedValue(INITIATE_RESPONSE);
    mockedFiles.uploadChunk.mockResolvedValue({ received: 1024 });
    mockedFiles.complete.mockResolvedValue(FILE_RECORD);
  });

  it("initiates upload, sends all chunks, and completes", async () => {
    const file = new File(["x".repeat(2000)], "export.json", {
      type: "application/json",
    });

    const { result } = renderHook(() => useFileUpload(), {
      wrapper: createWrapper(),
    });

    let fileRecord: FileRecord | undefined;
    await waitFor(async () => {
      fileRecord = await result.current.mutateAsync(file);
    });

    expect(mockedFiles.initiate).toHaveBeenCalledWith(
      "export.json",
      "application/json",
      2000,
    );
    expect(mockedFiles.uploadChunk).toHaveBeenCalledTimes(2);
    expect(mockedFiles.uploadChunk).toHaveBeenCalledWith(
      "upload-123",
      expect.any(Blob),
      0,
      2,
    );
    expect(mockedFiles.uploadChunk).toHaveBeenCalledWith(
      "upload-123",
      expect.any(Blob),
      1,
      2,
    );
    expect(mockedFiles.complete).toHaveBeenCalledWith("upload-123");
    expect(fileRecord).toEqual(FILE_RECORD);
  });

  it("handles single-chunk files", async () => {
    mockedFiles.initiate.mockResolvedValue({
      ...INITIATE_RESPONSE,
      chunk_total: 1,
    });
    const file = new File(["small"], "tiny.json", {
      type: "application/json",
    });

    const { result } = renderHook(() => useFileUpload(), {
      wrapper: createWrapper(),
    });

    await waitFor(async () => {
      await result.current.mutateAsync(file);
    });

    expect(mockedFiles.uploadChunk).toHaveBeenCalledTimes(1);
  });

  it("propagates initiate errors", async () => {
    mockedFiles.initiate.mockRejectedValue(new Error("Upload failed"));
    const file = new File(["data"], "bad.json", { type: "application/json" });

    const { result } = renderHook(() => useFileUpload(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync(file)).rejects.toThrow(
      "Upload failed",
    );
  });

  it("propagates chunk upload errors", async () => {
    mockedFiles.uploadChunk.mockRejectedValueOnce(new Error("Chunk failed"));
    const file = new File(["x".repeat(2000)], "export.json", {
      type: "application/json",
    });

    const { result } = renderHook(() => useFileUpload(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync(file)).rejects.toThrow(
      "Chunk failed",
    );
  });

  it("defaults content type to application/json for files without type", async () => {
    const file = new File(["data"], "export.json");

    const { result } = renderHook(() => useFileUpload(), {
      wrapper: createWrapper(),
    });

    await waitFor(async () => {
      await result.current.mutateAsync(file);
    });

    expect(mockedFiles.initiate).toHaveBeenCalledWith(
      "export.json",
      "application/json",
      4,
    );
  });
});
