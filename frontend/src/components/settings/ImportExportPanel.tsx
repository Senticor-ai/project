import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { IMPORT_SOURCES, type ExportOptions } from "@/model/settings-types";
import { ImportJobRow, type ImportJobData } from "./ImportJobRow";

export interface ImportExportPanelProps {
  onImportNirvana: () => void;
  onExport: (options: ExportOptions) => void;
  importJobs?: ImportJobData[];
  className?: string;
}

export function ImportExportPanel({
  onImportNirvana,
  onExport,
  importJobs,
  className,
}: ImportExportPanelProps) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  return (
    <div className={cn("space-y-6", className)}>
      {/* Import Section */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">
          <span className="flex items-center gap-1">
            <Icon name="download" size={14} />
            Import
          </span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {IMPORT_SOURCES.map((source) => (
            <div
              key={source.id}
              className={cn(
                "flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed p-4 text-center",
                source.available ? "border-border" : "border-paper-200",
              )}
            >
              <Icon
                name={source.icon}
                size={24}
                className={cn(
                  source.available ? "text-blueprint-500" : "text-text-subtle",
                )}
              />
              <span className="text-sm font-medium text-text-primary">
                {source.name}
              </span>
              <p className="text-xs text-text-subtle">{source.description}</p>
              {source.available ? (
                <button
                  type="button"
                  onClick={
                    source.id === "nirvana" ? onImportNirvana : undefined
                  }
                  aria-label={`Import from ${source.name}`}
                  className="mt-auto rounded-[var(--radius-md)] bg-blueprint-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blueprint-700"
                >
                  Import
                </button>
              ) : (
                <span className="mt-auto rounded-full bg-paper-200 px-2 py-0.5 text-xs text-text-muted">
                  Coming soon
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Import History */}
      {importJobs && importJobs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-primary">
            <span className="flex items-center gap-1">
              <Icon name="history" size={14} />
              Recent imports
            </span>
          </h2>
          <div className="space-y-2">
            {importJobs.map((job) => (
              <ImportJobRow key={job.job_id} job={job} />
            ))}
          </div>
        </section>
      )}

      {/* Export Section */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">
          <span className="flex items-center gap-1">
            <Icon name="upload" size={14} />
            Export
          </span>
        </h2>
        <fieldset className="space-y-2">
          <legend className="text-xs text-text-subtle">
            Export your active GTD items to a file for backup or migration.
          </legend>
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="accent-blueprint-600 focus-visible:ring-2 focus-visible:ring-blueprint-500"
            />
            Include archived
          </label>
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(e) => setIncludeCompleted(e.target.checked)}
              className="accent-blueprint-600 focus-visible:ring-2 focus-visible:ring-blueprint-500"
            />
            Include completed
          </label>
        </fieldset>
        <button
          type="button"
          onClick={() => onExport({ includeArchived, includeCompleted })}
          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border px-4 py-2 text-sm transition-colors hover:bg-paper-100"
        >
          <Icon name="data_object" size={16} />
          Export JSON
        </button>
      </section>
    </div>
  );
}
