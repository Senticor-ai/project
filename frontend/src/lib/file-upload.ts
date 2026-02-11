import { FilesApi } from "@/lib/api-client";
import type { FileRecord } from "@/lib/api-client";

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
  const { upload_id, chunk_size, chunk_total } = await FilesApi.initiate(
    file.name,
    contentType,
    file.size,
  );

  for (let i = 0; i < chunk_total; i++) {
    const start = i * chunk_size;
    const chunk = file.slice(start, start + chunk_size);
    await FilesApi.uploadChunk(upload_id, chunk, i, chunk_total);
  }

  return FilesApi.complete(upload_id);
}
