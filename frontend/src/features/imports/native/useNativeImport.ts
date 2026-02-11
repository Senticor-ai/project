import { ImportsApi } from "@/lib/api-client";
import { useImportSource } from "../shared/useImportSource";
import type { ImportSourceConfig } from "../shared/types";

const nativeConfig: ImportSourceConfig = {
  sourceId: "native",
  title: "Import from TerminAndoYo",
  description:
    "Drop your TerminAndoYo JSON export file below, or click to browse.",
  dropLabel: "Drop TerminAndoYo export here",
  fileTestId: "native-file-input",
  inspectFn: (req) => ImportsApi.inspectNative(req),
  importFn: (req) => ImportsApi.importNativeFromFile(req),
};

export { nativeConfig };

export function useNativeImport() {
  return useImportSource(nativeConfig);
}
