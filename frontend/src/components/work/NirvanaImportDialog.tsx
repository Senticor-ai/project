import { useState, useCallback, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { useNirvanaImport } from "@/hooks/use-nirvana-import";
import type { Bucket } from "@/model/types";

export interface NirvanaImportDialogProps {
  open: boolean;
  onClose: () => void;
  onNavigateToBucket?: (bucket: Bucket) => void;
}

type Step = "select" | "uploading" | "preview" | "importing" | "results";

export function NirvanaImportDialog({
  open,
  onClose,
  onNavigateToBucket,
}: NirvanaImportDialogProps) {
  const { upload, inspect, startImport, job, setJobId } = useNirvanaImport();
  const [step, setStep] = useState<Step>("select");
  const [fileId, setFileId] = useState<string | null>(null);
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setStep("uploading");
      try {
        const record = await upload.mutateAsync(file);
        setFileId(record.file_id);
        await inspect.mutateAsync({
          fileId: record.file_id,
          includeCompleted,
        });
        setStep("preview");
      } catch {
        setStep("select");
      }
    },
    [upload, inspect, includeCompleted],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleIncludeCompletedChange = useCallback(
    async (checked: boolean) => {
      setIncludeCompleted(checked);
      if (fileId) {
        await inspect.mutateAsync({ fileId, includeCompleted: checked });
      }
    },
    [fileId, inspect],
  );

  const handleImport = useCallback(async () => {
    if (!fileId) return;
    setStep("importing");
    try {
      const jobResponse = await startImport.mutateAsync({
        fileId,
        includeCompleted,
      });
      setJobId(jobResponse.job_id);
      setStep("results");
    } catch {
      setStep("preview");
    }
  }, [fileId, includeCompleted, startImport, setJobId]);

  if (!open) return null;

  const preview = inspect.data;
  const jobData = job.data;
  const finalSummary = jobData?.summary ?? preview;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-[var(--radius-lg)] bg-paper-50 p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            Import from Nirvana
          </h2>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-md)] p-1 text-text-subtle hover:bg-paper-100"
            aria-label="Close"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Step: File Selection */}
        {step === "select" && (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">
              Drop your Nirvana JSON export file below, or click to browse.
            </p>
            <div
              className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed border-border p-8 transition-colors hover:border-blueprint-400 hover:bg-blueprint-50/30"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="upload_file" size={32} className="text-text-subtle" />
              <p className="text-sm text-text-muted">
                Drop Nirvana export here
              </p>
            </div>
            <input
              ref={fileInputRef}
              data-testid="nirvana-file-input"
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileInput}
            />
            {upload.error && (
              <p className="text-sm text-red-600">
                Upload failed: {upload.error.message}
              </p>
            )}
          </div>
        )}

        {/* Step: Uploading */}
        {step === "uploading" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Icon
              name="cloud_upload"
              size={32}
              className="animate-pulse text-blueprint-500"
            />
            <p className="text-sm text-text-muted">Uploading file...</p>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && preview && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-text-primary">
              {preview.total} items found
            </p>

            {/* Bucket breakdown */}
            <div className="space-y-1">
              {Object.entries(preview.bucket_counts).map(([bucket, count]) => (
                <div
                  key={bucket}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="capitalize text-text-muted">{bucket}</span>
                  <span className="font-mono text-text-primary">{count}</span>
                </div>
              ))}
            </div>

            {/* Include completed toggle */}
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={(e) => handleIncludeCompletedChange(e.target.checked)}
              />
              Include completed items
            </label>

            {/* Errors */}
            {preview.errors > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-amber-600">
                  {preview.errors} items with errors
                </p>
                {preview.sample_errors.map((err) => (
                  <p key={err} className="text-xs text-text-subtle">
                    {err}
                  </p>
                ))}
              </div>
            )}

            {/* Import button */}
            <button
              onClick={handleImport}
              className="w-full rounded-[var(--radius-md)] bg-blueprint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blueprint-700"
            >
              Import {preview.total - preview.errors} items
            </button>
          </div>
        )}

        {/* Step: Importing */}
        {step === "importing" && !jobData?.summary && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Icon
              name="sync"
              size={32}
              className="animate-spin text-blueprint-500"
            />
            <p className="text-sm text-text-muted">Importing...</p>
            {jobData && (
              <p className="text-xs text-text-subtle">
                Status: {jobData.status}
              </p>
            )}
          </div>
        )}

        {/* Step: Results */}
        {(step === "results" || (step === "importing" && jobData?.summary)) &&
          finalSummary && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {jobData?.error ? (
                  <Icon name="error" size={20} className="text-red-500" />
                ) : (
                  <Icon
                    name="check_circle"
                    size={20}
                    className="text-green-500"
                  />
                )}
                <p className="text-sm font-medium text-text-primary">
                  Import {jobData?.error ? "failed" : "complete"}
                </p>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-text-subtle">Created</span>
                  <span className="ml-2 font-mono">{finalSummary.created}</span>
                </div>
                <div>
                  <span className="text-text-subtle">Updated</span>
                  <span className="ml-2 font-mono">{finalSummary.updated}</span>
                </div>
                <div>
                  <span className="text-text-subtle">Skipped</span>
                  <span className="ml-2 font-mono">{finalSummary.skipped}</span>
                </div>
                <div>
                  <span className="text-text-subtle">Errors</span>
                  <span className="ml-2 font-mono">{finalSummary.errors}</span>
                </div>
              </div>

              {/* Bucket breakdown — clickable rows */}
              {Object.keys(finalSummary.bucket_counts).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted">
                    By bucket
                  </p>
                  {Object.entries(finalSummary.bucket_counts).map(
                    ([bucket, count]) => (
                      <button
                        key={bucket}
                        type="button"
                        onClick={() => {
                          onNavigateToBucket?.(bucket as Bucket);
                          onClose();
                        }}
                        className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1 text-sm transition-colors hover:bg-paper-100"
                      >
                        <span className="capitalize text-text-muted">
                          {bucket}
                        </span>
                        <span className="font-mono text-text-primary">
                          {count}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              )}

              {/* Error details */}
              {jobData?.error && (
                <p className="text-sm text-red-600">{jobData.error}</p>
              )}

              {finalSummary.sample_errors.length > 0 && (
                <div className="space-y-1">
                  {finalSummary.sample_errors.map((err) => (
                    <p key={err} className="text-xs text-text-subtle">
                      {err}
                    </p>
                  ))}
                </div>
              )}

              {/* Guidance + CTAs */}
              {!jobData?.error && (
                <>
                  <p className="text-xs text-text-subtle">
                    Your items are organized into buckets. Click a bucket above
                    to jump there, or start with your inbox to triage.
                  </p>
                  <div className="flex gap-2">
                    {finalSummary.bucket_counts.inbox > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateToBucket?.("inbox");
                          onClose();
                        }}
                        className="flex-1 rounded-[var(--radius-md)] bg-blueprint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blueprint-700"
                      >
                        View inbox
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 rounded-[var(--radius-md)] border border-border px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-paper-100"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}

              {/* Close on error */}
              {jobData?.error && (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-[var(--radius-md)] border border-border px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-paper-100"
                >
                  Close
                </button>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
