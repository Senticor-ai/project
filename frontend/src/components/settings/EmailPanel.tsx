import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { EmailConnectionCard } from "./EmailConnectionCard";
import type { EmailConnectionResponse } from "@/lib/api-client";

export interface EmailPanelProps {
  connections?: EmailConnectionResponse[];
  isLoading?: boolean;
  onConnectGmail?: () => void;
  onSync?: (connectionId: string) => void;
  onDisconnect?: (connectionId: string) => void;
  onUpdateSyncInterval?: (connectionId: string, minutes: number) => void;
  onUpdateMarkRead?: (connectionId: string, markRead: boolean) => void;
  syncingConnectionId?: string | null;
  className?: string;
}

export function EmailPanel({
  connections = [],
  isLoading,
  onConnectGmail,
  onSync,
  onDisconnect,
  onUpdateSyncInterval,
  onUpdateMarkRead,
  syncingConnectionId,
  className,
}: EmailPanelProps) {
  const activeConnections = connections.filter((c) => c.is_active);

  return (
    <div className={cn("space-y-6", className)}>
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">
          E-Mail-Verbindungen
        </h2>
        <p className="text-xs text-text-subtle">
          Verbinde dein E-Mail-Konto, um E-Mails direkt in deinem Eingang zu
          sehen und zu triagieren.
        </p>
      </section>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Icon
            name="progress_activity"
            size={24}
            className="animate-spin text-text-muted"
          />
        </div>
      )}

      {!isLoading && activeConnections.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border-2 border-dashed border-border py-10">
          <Icon name="mail" size={40} className="text-text-muted" />
          <p className="text-sm text-text-muted">
            Keine E-Mail-Verbindung eingerichtet
          </p>
          <button
            type="button"
            onClick={onConnectGmail}
            className="flex items-center gap-2 rounded-[var(--radius-md)] bg-blueprint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blueprint-700"
          >
            <Icon name="link" size={16} />
            Mit Google verbinden
          </button>
        </div>
      )}

      {!isLoading && activeConnections.length > 0 && (
        <div className="space-y-4">
          {activeConnections.map((conn) => (
            <EmailConnectionCard
              key={conn.connection_id}
              connection={conn}
              onSync={() => onSync?.(conn.connection_id)}
              onDisconnect={() => onDisconnect?.(conn.connection_id)}
              onUpdateSyncInterval={(minutes) =>
                onUpdateSyncInterval?.(conn.connection_id, minutes)
              }
              onUpdateMarkRead={(markRead) =>
                onUpdateMarkRead?.(conn.connection_id, markRead)
              }
              isSyncing={syncingConnectionId === conn.connection_id}
            />
          ))}

          <button
            type="button"
            onClick={onConnectGmail}
            className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-paper-100"
          >
            <Icon name="add" size={14} />
            Weitere Verbindung hinzufugen
          </button>
        </div>
      )}
    </div>
  );
}
