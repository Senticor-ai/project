import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export type ImportJobStatus = "queued" | "running" | "completed" | "failed";

export interface ImportJobSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface ImportJobData {
  job_id: string;
  status: ImportJobStatus;
  source: string;
  total: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  summary: ImportJobSummary | null;
  progress: {
    processed: number;
    total: number;
    created?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
  } | null;
  error: string | null;
}

const statusConfig: Record<
  ImportJobStatus,
  { icon: string; label: string; color: string }
> = {
  queued: {
    icon: "hourglass_empty",
    label: "Queued",
    color: "text-text-subtle",
  },
  running: {
    icon: "sync",
    label: "Running",
    color: "text-blueprint-600",
  },
  completed: {
    icon: "check_circle",
    label: "Completed",
    color: "text-status-success",
  },
  failed: {
    icon: "error",
    label: "Failed",
    color: "text-status-error",
  },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

/** Live elapsed-time display that ticks every second while active. */
function useElapsedTime(
  sinceIso: string | null,
  active: boolean,
): string | null {
  const [elapsed, setElapsed] = useState<string | null>(() => {
    if (!active || !sinceIso) return null;
    const ms = Date.now() - new Date(sinceIso).getTime();
    return formatElapsed(Math.max(0, ms));
  });

  useEffect(() => {
    if (!active || !sinceIso) return;

    const compute = () => {
      const ms = Date.now() - new Date(sinceIso).getTime();
      setElapsed(formatElapsed(Math.max(0, ms)));
    };

    // Deferred first fire (covers props change after initial render),
    // then periodic updates every second.  The lazy useState initializer
    // already provides the correct value on mount, so there is no flash.
    const immediateId = setTimeout(compute, 0);
    const intervalId = setInterval(compute, 1000);
    return () => {
      clearTimeout(immediateId);
      clearInterval(intervalId);
    };
  }, [sinceIso, active]);

  if (!active || !sinceIso) return null;
  return elapsed;
}

export interface ImportJobRowProps {
  job: ImportJobData;
  onRetry?: (jobId: string) => void;
  onArchive?: (jobId: string) => void;
  isRetrying?: boolean;
  className?: string;
}

export function ImportJobRow({
  job,
  onRetry,
  onArchive,
  isRetrying,
  className,
}: ImportJobRowProps) {
  const config = statusConfig[job.status];
  const isActive = job.status === "running" || job.status === "queued";
  const elapsed = useElapsedTime(
    job.status === "running" ? job.started_at : job.created_at,
    isActive,
  );

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-border bg-paper-50 px-4 py-3",
        className,
      )}
    >
      {/* Top line: source + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="cloud_download" size={14} className="text-text-subtle" />
          <span className="text-sm font-medium text-text-primary capitalize">
            {job.source}
          </span>
          {job.summary ? (
            <span className="text-xs text-text-subtle">
              {job.summary.total} items
            </span>
          ) : isActive && job.progress ? (
            <span className="text-xs text-text-subtle">
              {job.progress.processed} / {job.progress.total} items
            </span>
          ) : isActive ? (
            <span className="text-xs text-text-subtle">importing...</span>
          ) : null}
        </div>
        <div
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            config.color,
          )}
        >
          <Icon
            name={config.icon}
            size={14}
            className={cn(job.status === "running" && "animate-spin")}
          />
          {config.label}
        </div>
      </div>

      {/* Running stats (while importing with progress) */}
      {isActive &&
        job.progress &&
        (job.progress.created || job.progress.updated) && (
          <div className="mt-2 flex gap-4 text-xs text-text-muted">
            {!!job.progress.created && (
              <span>
                <span className="font-mono">{job.progress.created}</span>{" "}
                created
              </span>
            )}
            {!!job.progress.updated && (
              <span>
                <span className="font-mono">{job.progress.updated}</span>{" "}
                updated
              </span>
            )}
            {!!job.progress.skipped && (
              <span>
                <span className="font-mono">{job.progress.skipped}</span>{" "}
                skipped
              </span>
            )}
            {!!job.progress.errors && (
              <span className="text-status-error">
                <span className="font-mono">{job.progress.errors}</span> errors
              </span>
            )}
          </div>
        )}

      {/* Summary counts (when completed) */}
      {job.summary && (
        <div className="mt-2 flex gap-4 text-xs text-text-muted">
          <span>
            <span className="font-mono">{job.summary.created}</span> created
          </span>
          <span>
            <span className="font-mono">{job.summary.updated}</span> updated
          </span>
          <span>
            <span className="font-mono">{job.summary.skipped}</span> skipped
          </span>
          {job.summary.errors > 0 && (
            <span className="text-status-error">
              <span className="font-mono">{job.summary.errors}</span> errors
            </span>
          )}
        </div>
      )}

      {/* Error message (when failed) */}
      {job.error && (
        <p className="mt-2 text-xs text-status-error">{job.error}</p>
      )}

      {/* Actions for failed/completed jobs */}
      {(job.status === "failed" || job.status === "completed") &&
        (onRetry || onArchive) && (
          <div className="mt-2 flex items-center gap-2">
            {job.status === "failed" && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(job.job_id)}
                disabled={isRetrying}
                className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-paper-100 disabled:opacity-50"
              >
                <Icon name="refresh" size={14} />
                Retry
              </button>
            )}
            {onArchive && (
              <button
                type="button"
                onClick={() => onArchive(job.job_id)}
                className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border px-2.5 py-1 text-xs font-medium text-text-subtle transition-colors hover:bg-paper-100"
              >
                <Icon name="visibility_off" size={14} />
                Dismiss
              </button>
            )}
          </div>
        )}

      {/* Timestamps */}
      <div className="mt-2 flex items-center gap-3 text-[11px] text-text-subtle">
        {job.status === "running" && elapsed ? (
          <span>Running for {elapsed}</span>
        ) : job.status === "queued" && elapsed ? (
          <span>Queued for {elapsed}</span>
        ) : (
          <>
            <span>
              Started {job.started_at ? formatTime(job.started_at) : "—"}
            </span>
            {job.finished_at && job.started_at && (
              <>
                <span>Finished {formatTime(job.finished_at)}</span>
                <span>({formatDuration(job.started_at, job.finished_at)})</span>
              </>
            )}
            {!job.finished_at && !job.started_at && (
              <span>Queued {formatTime(job.created_at)}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
