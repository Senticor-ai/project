import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import type { FlushResponse } from "@/lib/api-client";

export interface PwaStorageStats {
  originUsage: number | null;
  originQuota: number | null;
  cachedQueryCount: number | null;
  queryCacheSize: number | null;
  cacheNames: string[];
  serviceWorkerActive: boolean;
  loading: boolean;
}

export interface DeveloperPanelProps {
  onFlush?: () => Promise<FlushResponse>;
  storageStats?: PwaStorageStats;
  onClearLocalCache?: () => Promise<void>;
  className?: string;
}

type FlushState =
  | { step: "idle" }
  | { step: "confirming" }
  | { step: "flushing" }
  | { step: "done"; result: FlushResponse }
  | { step: "error"; message: string };

type ClearState =
  | { step: "idle" }
  | { step: "confirming" }
  | { step: "clearing" }
  | { step: "done" }
  | { step: "error"; message: string };

function StatRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-xs text-text-subtle">{label}</span>
      <span className="text-xs font-medium text-text-primary tabular-nums">
        {value ?? "—"}
      </span>
    </div>
  );
}

export function DeveloperPanel({
  onFlush,
  storageStats,
  onClearLocalCache,
  className,
}: DeveloperPanelProps) {
  const [flushState, setFlushState] = useState<FlushState>({ step: "idle" });
  const [confirmText, setConfirmText] = useState("");
  const [clearState, setClearState] = useState<ClearState>({ step: "idle" });

  const handleFlush = async () => {
    if (!onFlush) return;
    setFlushState({ step: "flushing" });
    try {
      const result = await onFlush();
      setFlushState({ step: "done", result });
    } catch (err) {
      setFlushState({
        step: "error",
        message: err instanceof Error ? err.message : "Flush failed",
      });
    }
  };

  const handleClear = async () => {
    if (!onClearLocalCache) return;
    setClearState({ step: "clearing" });
    try {
      await onClearLocalCache();
      setClearState({ step: "done" });
    } catch (err) {
      setClearState({
        step: "error",
        message: err instanceof Error ? err.message : "Clear failed",
      });
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Local Storage section */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">
          <span className="flex items-center gap-1">
            <Icon name="storage" size={14} className="text-status-info" />
            Local Storage
          </span>
        </h2>
        <p className="text-xs text-text-subtle">
          Browser-side cache used for offline access. Clearing reloads fresh
          data from the server.
        </p>

        {storageStats && (
          <div className="divide-y divide-border rounded-[var(--radius-lg)] border border-border px-3">
            <StatRow
              label="Origin storage"
              value={
                storageStats.loading || storageStats.originUsage == null
                  ? null
                  : storageStats.originQuota != null
                    ? `${formatBytes(storageStats.originUsage)} / ${formatBytes(storageStats.originQuota)}`
                    : formatBytes(storageStats.originUsage)
              }
            />
            <StatRow
              label="Query cache"
              value={
                storageStats.loading || storageStats.cachedQueryCount == null
                  ? null
                  : storageStats.queryCacheSize != null
                    ? `${storageStats.cachedQueryCount} queries (${formatBytes(storageStats.queryCacheSize)})`
                    : `${storageStats.cachedQueryCount} queries`
              }
            />
            <StatRow
              label="Service worker"
              value={
                storageStats.loading
                  ? null
                  : storageStats.serviceWorkerActive
                    ? "Active"
                    : "Not registered"
              }
            />
            <StatRow
              label="Runtime caches"
              value={
                storageStats.loading
                  ? null
                  : storageStats.cacheNames.length > 0
                    ? storageStats.cacheNames.join(", ")
                    : "None"
              }
            />
          </div>
        )}

        {onClearLocalCache && (
          <div className="rounded-[var(--radius-lg)] border-2 border-dashed border-border/40 p-4">
            <div className="flex items-start gap-3">
              <Icon name="cached" size={24} className="text-text-subtle" />
              <div className="flex-1 space-y-2">
                <span className="text-sm font-medium text-text-primary">
                  Clear Local Cache
                </span>
                <p className="text-xs text-text-subtle">
                  Removes the offline query cache, runtime caches, and resets
                  in-memory state. Your server data is not affected.
                </p>

                {clearState.step === "idle" && (
                  <button
                    type="button"
                    onClick={() => setClearState({ step: "confirming" })}
                    className="rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-paper-100"
                  >
                    Clear Local Cache
                  </button>
                )}

                {clearState.step === "confirming" && (
                  <div className="space-y-2">
                    <p className="text-xs text-text-subtle">
                      Are you sure? The app will re-fetch all data from the
                      server.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleClear}
                        className="rounded-[var(--radius-md)] bg-text-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setClearState({ step: "idle" })}
                        className="rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-paper-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {clearState.step === "clearing" && (
                  <p className="text-xs text-text-subtle">Clearing cache...</p>
                )}

                {clearState.step === "done" && (
                  <div className="space-y-1 rounded-[var(--radius-md)] bg-status-success/10 p-3">
                    <p className="text-xs font-medium text-status-success">
                      Local cache cleared successfully.
                    </p>
                    <button
                      type="button"
                      onClick={() => setClearState({ step: "idle" })}
                      className="mt-2 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-paper-100"
                    >
                      Done
                    </button>
                  </div>
                )}

                {clearState.step === "error" && (
                  <div className="space-y-1 rounded-[var(--radius-md)] bg-status-error/10 p-3">
                    <p className="text-xs font-medium text-status-error">
                      {clearState.message}
                    </p>
                    <button
                      type="button"
                      onClick={() => setClearState({ step: "idle" })}
                      className="mt-2 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-paper-100"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Danger Zone section */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">
          <span className="flex items-center gap-1">
            <Icon name="warning" size={14} className="text-status-error" />
            Danger Zone
          </span>
        </h2>
        <p className="text-xs text-text-subtle">
          Developer tools for testing. These actions are destructive and cannot
          be undone.
        </p>

        <div className="rounded-[var(--radius-lg)] border-2 border-dashed border-status-error/40 p-4">
          <div className="flex items-start gap-3">
            <Icon
              name="delete_forever"
              size={24}
              className="text-status-error"
            />
            <div className="flex-1 space-y-2">
              <span className="text-sm font-medium text-text-primary">
                Flush All Data
              </span>
              <p className="text-xs text-text-subtle">
                Permanently deletes all items, files, imports, and related data.
                Your user account and session are preserved.
              </p>

              {flushState.step === "idle" && (
                <button
                  type="button"
                  onClick={() => {
                    setFlushState({ step: "confirming" });
                    setConfirmText("");
                  }}
                  className="rounded-[var(--radius-md)] bg-status-error px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
                >
                  Flush All Data
                </button>
              )}

              {flushState.step === "confirming" && (
                <div className="space-y-2">
                  <label
                    htmlFor="flush-confirm"
                    className="block text-xs text-text-subtle"
                  >
                    Type FLUSH to confirm
                  </label>
                  <input
                    id="flush-confirm"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="w-48 rounded-[var(--radius-md)] border border-border px-2 py-1 text-sm"
                    autoComplete="off"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={confirmText !== "FLUSH"}
                      onClick={handleFlush}
                      aria-label="Confirm flush"
                      className="rounded-[var(--radius-md)] bg-status-error px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      Confirm flush
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlushState({ step: "idle" })}
                      className="rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-paper-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {flushState.step === "flushing" && (
                <p className="text-xs text-text-subtle">Flushing data...</p>
              )}

              {flushState.step === "done" && (
                <div className="space-y-1 rounded-[var(--radius-md)] bg-status-success/10 p-3">
                  <p className="text-xs font-medium text-status-success">
                    Data flushed successfully
                  </p>
                  <ul className="space-y-0.5 text-xs text-status-success">
                    {Object.entries(flushState.result.deleted).map(
                      ([table, count]) => (
                        <li key={table}>
                          {table}: {count}
                        </li>
                      ),
                    )}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setFlushState({ step: "idle" })}
                    className="mt-2 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-paper-100"
                  >
                    Done
                  </button>
                </div>
              )}

              {flushState.step === "error" && (
                <div className="space-y-1 rounded-[var(--radius-md)] bg-status-error/10 p-3">
                  <p className="text-xs font-medium text-status-error">
                    {flushState.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => setFlushState({ step: "idle" })}
                    className="mt-2 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-paper-100"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
