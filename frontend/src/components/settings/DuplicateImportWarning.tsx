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
      className="rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 p-4"
    >
      <div className="flex items-start gap-3">
        <Icon
          name="warning"
          size={20}
          className="mt-0.5 shrink-0 text-amber-700"
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-amber-900">
            This file was already imported
          </p>
          <p className="text-xs text-amber-800">
            A previous import with the same file ({previousImport.total} items)
            was {previousImport.status} on{" "}
            {formatDate(previousImport.created_at)}. Importing again will update
            existing items and create any new ones.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onContinue}
              className="rounded-[var(--radius-md)] bg-amber-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-800"
            >
              Import anyway
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[var(--radius-md)] border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
