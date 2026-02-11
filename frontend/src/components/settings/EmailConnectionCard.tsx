import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { EmailConnectionResponse } from "@/lib/api-client";

export interface EmailConnectionCardProps {
  connection: EmailConnectionResponse;
  onSync?: () => void;
  onDisconnect?: () => void;
  onUpdateSyncInterval?: (minutes: number) => void;
  onUpdateMarkRead?: (markRead: boolean) => void;
  isSyncing?: boolean;
  className?: string;
}

const labelClass = "mb-1 flex items-center gap-1 text-xs text-text-muted";
const selectClass =
  "w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs";

function StatusBadge({
  connection,
  isSyncing,
}: {
  connection: EmailConnectionResponse;
  isSyncing?: boolean;
}) {
  if (isSyncing) {
    return (
      <span className="flex items-center gap-1 text-xs text-blueprint-600">
        <Icon name="sync" size={12} className="animate-spin" />
        Synchronisiere...
      </span>
    );
  }
  if (connection.last_sync_error) {
    return (
      <span
        className="flex items-center gap-1 text-xs text-status-error"
        title={connection.last_sync_error}
      >
        <Icon name="error" size={12} />
        Fehler
      </span>
    );
  }
  if (connection.last_sync_at) {
    return (
      <span className="flex items-center gap-1 text-xs text-status-success">
        <Icon name="check_circle" size={12} />
        Verbunden
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-text-muted">
      <Icon name="circle" size={12} />
      Nicht synchronisiert
    </span>
  );
}

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `vor ${diffHrs} Std.`;
  const diffDays = Math.floor(diffHrs / 24);
  return `vor ${diffDays} Tag${diffDays > 1 ? "en" : ""}`;
}

export function EmailConnectionCard({
  connection,
  onSync,
  onDisconnect,
  onUpdateSyncInterval,
  onUpdateMarkRead,
  isSyncing,
  className,
}: EmailConnectionCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-surface-raised p-4 space-y-4",
        className,
      )}
    >
      {/* Header: email + status */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blueprint-50">
            <Icon name="mail" size={20} className="text-blueprint-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {connection.display_name ?? connection.email_address}
            </p>
            {connection.display_name && (
              <p className="text-xs text-text-muted">
                {connection.email_address}
              </p>
            )}
          </div>
        </div>
        <StatusBadge connection={connection} isSyncing={isSyncing} />
      </div>

      {/* Sync info */}
      {connection.last_sync_at && (
        <p className="text-xs text-text-muted">
          Letzte Synchronisierung: {formatRelativeTime(connection.last_sync_at)}
          {connection.last_sync_message_count != null && (
            <> &middot; {connection.last_sync_message_count} E-Mails</>
          )}
        </p>
      )}

      {/* Error detail */}
      {connection.last_sync_error && (
        <p className="rounded-[var(--radius-sm)] bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {connection.last_sync_error}
        </p>
      )}

      {/* Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="email-sync-interval" className={labelClass}>
            <Icon name="timer" size={10} />
            Sync-Intervall
          </label>
          <select
            id="email-sync-interval"
            aria-label="Sync interval"
            value={connection.sync_interval_minutes}
            onChange={(e) => onUpdateSyncInterval?.(Number(e.target.value))}
            className={selectClass}
          >
            <option value={0}>Manuell</option>
            <option value={5}>Alle 5 Minuten</option>
            <option value={15}>Alle 15 Minuten</option>
            <option value={30}>Alle 30 Minuten</option>
            <option value={60}>Jede Stunde</option>
          </select>
        </div>

        <div className="flex items-end pb-0.5">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={connection.sync_mark_read}
              onChange={(e) => onUpdateMarkRead?.(e.target.checked)}
              aria-label="Mark as read in Gmail"
            />
            In Gmail als gelesen markieren
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center gap-1 rounded-[var(--radius-md)] bg-blueprint-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blueprint-700 disabled:opacity-50"
        >
          <Icon name="sync" size={14} />
          Jetzt synchronisieren
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          className="rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-paper-100"
        >
          Verbindung trennen
        </button>
      </div>
    </div>
  );
}
