import { FilesApi } from "@/lib/api-client";
import type { FileRecord } from "@/lib/api-client";

const UPLOAD_MAX_RETRIES = 3;
const UPLOAD_BASE_BACKOFF_MS = 300;
const UPLOAD_MAX_BACKOFF_MS = 5000;
const RETRYABLE_STATUS_CODES = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

type RetryableUploadError = {
  status?: unknown;
  details?: unknown;
};

function parseStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as RetryableUploadError).status;
  if (typeof status !== "number" || !Number.isFinite(status)) return null;
  return status;
}

function parseRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const details = (error as RetryableUploadError).details;
  if (!details || typeof details !== "object") return null;
  const retryAfter = (details as { retryAfter?: unknown }).retryAfter;
  if (typeof retryAfter !== "number" || !Number.isFinite(retryAfter)) return null;
  if (retryAfter <= 0) return null;
  return retryAfter * 1000;
}

function isRetryable(error: unknown): boolean {
  const status = parseStatus(error);
  return status !== null && RETRYABLE_STATUS_CODES.has(status);
}

function retryDelayMs(attempt: number, error: unknown): number {
  const backoff = Math.min(
    UPLOAD_BASE_BACKOFF_MS * 2 ** (attempt - 1),
    UPLOAD_MAX_BACKOFF_MS,
  );
  const retryAfterMs = parseRetryAfterMs(error);
  if (retryAfterMs === null) return backoff;
  return Math.max(backoff, retryAfterMs);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withUploadRetry<T>(operation: () => Promise<T>): Promise<T> {
  let retries = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryable(error) || retries >= UPLOAD_MAX_RETRIES) {
        throw error;
      }
      retries += 1;
      await sleep(retryDelayMs(retries, error));
    }
  }
}

/**
 * Upload a file to the backend using the chunked upload API.
 * Returns the completed FileRecord with file_id and download_url.
 *
 * The backend stores files by UUID (file_id), not by the user-provided
 * filename — the original name is preserved in FileRecord.original_name
 * for display only.
 */
export async function uploadFile(file: File): Promise<FileRecord> {
  const contentType = file.type || "application/octet-stream";
  const { upload_id, chunk_size, chunk_total } = await withUploadRetry(() =>
    FilesApi.initiate(file.name, contentType, file.size),
  );

  for (let i = 0; i < chunk_total; i++) {
    const start = i * chunk_size;
    const chunk = file.slice(start, start + chunk_size);
    await withUploadRetry(() =>
      FilesApi.uploadChunk(upload_id, chunk, i, chunk_total),
    );
  }

  return withUploadRetry(() => FilesApi.complete(upload_id));
}
