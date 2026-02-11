import type { ImportSummary, ImportJobResponse } from "@/lib/api-client";

export interface ImportSourceConfig {
  sourceId: string;
  title: string;
  description: string;
  dropLabel: string;
  fileTestId: string;
  inspectFn: (req: {
    file_id: string;
    include_completed: boolean;
  }) => Promise<ImportSummary>;
  importFn: (req: {
    file_id: string;
    include_completed: boolean;
  }) => Promise<ImportJobResponse>;
}
