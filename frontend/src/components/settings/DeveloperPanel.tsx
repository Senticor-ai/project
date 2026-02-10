import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { FlushResponse } from "@/lib/api-client";

export interface DeveloperPanelProps {
  onFlush?: () => Promise<FlushResponse>;
  className?: string;
}

type FlushState =
  | { step: "idle" }
  | { step: "confirming" }
  | { step: "flushing" }
  | { step: "done"; result: FlushResponse }
  | { step: "error"; message: string };

export function DeveloperPanel({ onFlush, className }: DeveloperPanelProps) {
  const [state, setState] = useState<FlushState>({ step: "idle" });
  const [confirmText, setConfirmText] = useState("");

  const handleFlush = async () => {
    if (!onFlush) return;
    setState({ step: "flushing" });
    try {
      const result = await onFlush();
      setState({ step: "done", result });
    } catch (err) {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "Flush failed",
      });
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">
          <span className="flex items-center gap-1">
            <Icon name="warning" size={14} className="text-red-600" />
            Danger Zone
          </span>
        </h2>
        <p className="text-xs text-text-subtle">
          Developer tools for testing. These actions are destructive and cannot
          be undone.
        </p>

        <div className="rounded-[var(--radius-lg)] border-2 border-dashed border-red-300 p-4">
          <div className="flex items-start gap-3">
            <Icon name="delete_forever" size={24} className="text-red-600" />
            <div className="flex-1 space-y-2">
              <span className="text-sm font-medium text-text-primary">
                Flush All Data
              </span>
              <p className="text-xs text-text-subtle">
                Permanently deletes all items, files, imports, and related data.
                Your user account and session are preserved.
              </p>

              {state.step === "idle" && (
                <button
                  type="button"
                  onClick={() => {
                    setState({ step: "confirming" });
                    setConfirmText("");
                  }}
                  className="rounded-[var(--radius-md)] bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
                >
                  Flush All Data
                </button>
              )}

              {state.step === "confirming" && (
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
                      className="rounded-[var(--radius-md)] bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                    >
                      Confirm flush
                    </button>
                    <button
                      type="button"
                      onClick={() => setState({ step: "idle" })}
                      className="rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-paper-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {state.step === "flushing" && (
                <p className="text-xs text-text-subtle">Flushing data...</p>
              )}

              {state.step === "done" && (
                <div className="space-y-1 rounded-[var(--radius-md)] bg-green-50 p-3">
                  <p className="text-xs font-medium text-green-700">
                    Data flushed successfully
                  </p>
                  <ul className="space-y-0.5 text-xs text-green-700">
                    {Object.entries(state.result.deleted).map(
                      ([table, count]) => (
                        <li key={table}>
                          {table}: {count}
                        </li>
                      ),
                    )}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setState({ step: "idle" })}
                    className="mt-2 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-paper-100"
                  >
                    Done
                  </button>
                </div>
              )}

              {state.step === "error" && (
                <div className="space-y-1 rounded-[var(--radius-md)] bg-red-50 p-3">
                  <p className="text-xs font-medium text-red-700">
                    {state.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => setState({ step: "idle" })}
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
