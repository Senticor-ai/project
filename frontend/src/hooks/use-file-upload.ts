import { useMutation } from "@tanstack/react-query";
import { uploadFile } from "@/lib/file-upload";
import type { FileRecord } from "@/lib/api-client";

export function useFileUpload() {
  return useMutation<FileRecord, Error, File>({
    mutationFn: uploadFile,
  });
}
