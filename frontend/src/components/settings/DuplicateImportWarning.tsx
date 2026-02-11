import { Icon } from "@/components/ui/Icon";

export interface PreviousImport {
  job_id: string;
  status: string;
  total: number;
  created_at: string;
}

export interface DuplicateImportWarningProps {
  previousImport: PreviousImport;
  onContinue: () => void;
  onCancel: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DuplicateImportWarning({
  previousImport,
  onContinue,
  onCancel,
}: DuplicateImportWarningProps) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-md)] border border-status-warning/30 bg-status-warning/10 p-4"
    >
      <div className="flex items-start gap-3">
        <Icon
          name="warning"
          size={20}
          className="mt-0.5 shrink-0 text-status-warning"
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-status-warning">
            This file was already imported
          </p>
          <p className="text-xs text-status-warning">
            A previous import with the same file ({previousImport.total} items)
            was {previousImport.status} on{" "}
            {formatDate(previousImport.created_at)}. Importing again will update
            existing items and create any new ones.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onContinue}
              className="rounded-[var(--radius-md)] bg-status-warning px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
            >
              Import anyway
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[var(--radius-md)] border border-status-warning/30 px-3 py-1.5 text-xs font-medium text-status-warning transition-colors hover:bg-status-warning/15"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
