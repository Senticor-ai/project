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
  progress: { processed: number; total: number } | null;
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
    color: "text-green-700",
  },
  failed: {
    icon: "error",
    label: "Failed",
    color: "text-red-600",
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
    if (!active || !sinceIso) {
      setElapsed(null);
      return;
    }

    const compute = () => {
      const ms = Date.now() - new Date(sinceIso).getTime();
      setElapsed(formatElapsed(Math.max(0, ms)));
    };

    // Compute immediately on mount (covers props change after initial render),
    // then periodic updates every second.
    compute();
    const intervalId = setInterval(compute, 1000);
    return () => {
      clearInterval(intervalId);
    };
  }, [sinceIso, active]);

  if (!active) return null;
  return elapsed;
}

export interface ImportJobRowProps {
  job: ImportJobData;
  className?: string;
}

export function ImportJobRow({ job, className }: ImportJobRowProps) {
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
            <span className="text-red-600">
              <span className="font-mono">{job.summary.errors}</span> errors
            </span>
          )}
        </div>
      )}

      {/* Error message (when failed) */}
      {job.error && <p className="mt-2 text-xs text-red-600">{job.error}</p>}

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
