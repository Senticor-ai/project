import { ImportsApi } from "@/lib/api-client";
import { useImportSource } from "../shared/useImportSource";
import type { ImportSourceConfig } from "../shared/types";

const nirvanaConfig: ImportSourceConfig = {
  sourceId: "nirvana",
  title: "Import from Nirvana",
  description: "Drop your Nirvana JSON export file below, or click to browse.",
  dropLabel: "Drop Nirvana export here",
  fileTestId: "nirvana-file-input",
  inspectFn: (req) => ImportsApi.inspectNirvana(req),
  importFn: (req) => ImportsApi.importNirvanaFromFile(req),
};

export { nirvanaConfig };

export function useNirvanaImport() {
  return useImportSource(nirvanaConfig);
}
