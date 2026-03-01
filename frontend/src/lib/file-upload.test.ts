import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FilesApi } from "@/lib/api-client";
import type { FileInitiateResponse, FileRecord } from "@/lib/api-client";
import { uploadFile } from "./file-upload";

vi.mock("@/lib/api-client", () => ({
  FilesApi: {
    initiate: vi.fn(),
    uploadChunk: vi.fn(),
    complete: vi.fn(),
  },
}));

const mockedFiles = vi.mocked(FilesApi);

const INITIATE_RESPONSE: FileInitiateResponse = {
  upload_id: "upload-123",
  upload_url: "/files/upload/upload-123",
  chunk_size: 1024,
  chunk_total: 2,
  expires_at: "2026-02-07T00:00:00Z",
};

const FILE_RECORD: FileRecord = {
  file_id: "file-abc",
  original_name: "report.pdf",
  content_type: "application/pdf",
  size_bytes: 2000,
  sha256: "abc123",
  created_at: "2026-02-06T12:00:00Z",
  download_url: "/files/file-abc",
};

function apiError(
  message: string,
  status: number,
  details?: unknown,
): Error & { status: number; details?: unknown } {
  const error = new Error(message) as Error & {
    status: number;
    details?: unknown;
  };
  error.status = status;
  error.details = details;
  return error;
}

describe("uploadFile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedFiles.initiate.mockResolvedValue(INITIATE_RESPONSE);
    mockedFiles.uploadChunk.mockResolvedValue({ received: 1024 });
    mockedFiles.complete.mockResolvedValue(FILE_RECORD);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initiates, uploads chunks, and completes", async () => {
    const file = new File(["x".repeat(2000)], "report.pdf", {
      type: "application/pdf",
    });

    const result = await uploadFile(file);

    expect(mockedFiles.initiate).toHaveBeenCalledWith(
      "report.pdf",
      "application/pdf",
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
    expect(result).toEqual(FILE_RECORD);
  });

  it("handles single-chunk files", async () => {
    mockedFiles.initiate.mockResolvedValue({
      ...INITIATE_RESPONSE,
      chunk_total: 1,
    });
    const file = new File(["small"], "tiny.txt", { type: "text/plain" });

    await uploadFile(file);

    expect(mockedFiles.uploadChunk).toHaveBeenCalledTimes(1);
  });

  it("defaults MIME to application/octet-stream for unknown types", async () => {
    const file = new File(["data"], "mystery.bin");

    await uploadFile(file);

    expect(mockedFiles.initiate).toHaveBeenCalledWith(
      "mystery.bin",
      "application/octet-stream",
      4,
    );
  });

  it("propagates initiate errors", async () => {
    mockedFiles.initiate.mockRejectedValue(new Error("Initiate failed"));
    const file = new File(["data"], "bad.pdf", { type: "application/pdf" });

    await expect(uploadFile(file)).rejects.toThrow("Initiate failed");
  });

  it("propagates chunk upload errors", async () => {
    mockedFiles.uploadChunk.mockRejectedValueOnce(new Error("Chunk failed"));
    const file = new File(["x".repeat(2000)], "report.pdf", {
      type: "application/pdf",
    });

    await expect(uploadFile(file)).rejects.toThrow("Chunk failed");
  });

  it("retries with backoff for retryable upload errors", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    mockedFiles.uploadChunk
      .mockRejectedValueOnce(
        apiError("Too many requests", 429, { retryAfter: 1 }),
      )
      .mockRejectedValueOnce(apiError("Server unavailable", 503))
      .mockResolvedValue({ received: 1024 });

    const file = new File(["x".repeat(2000)], "report.pdf", {
      type: "application/pdf",
    });
    const uploadPromise = uploadFile(file);

    await vi.runAllTimersAsync();
    const result = await uploadPromise;

    expect(result).toEqual(FILE_RECORD);
    expect(mockedFiles.uploadChunk).toHaveBeenCalledTimes(4);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 600);
  });

  it("fails after max retries for retryable errors", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    mockedFiles.uploadChunk.mockRejectedValue(
      apiError("Server unavailable", 503),
    );

    const file = new File(["x".repeat(2000)], "report.pdf", {
      type: "application/pdf",
    });
    const uploadPromise = uploadFile(file);
    const rejection = expect(uploadPromise).rejects.toThrow(
      "Server unavailable",
    );

    await vi.runAllTimersAsync();
    await rejection;

    expect(mockedFiles.uploadChunk).toHaveBeenCalledTimes(4);
    expect(mockedFiles.complete).not.toHaveBeenCalled();
    expect(setTimeoutSpy).toHaveBeenCalledTimes(3);
  });
});
