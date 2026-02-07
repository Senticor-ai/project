import { useMutation } from "@tanstack/react-query";
import { FilesApi } from "@/lib/api-client";
import type { FileRecord } from "@/lib/api-client";

export function useFileUpload() {
  return useMutation<FileRecord, Error, File>({
    mutationFn: async (file: File) => {
      const contentType = file.type || "application/json";
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
    },
  });
}
