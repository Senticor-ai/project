import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { EmailConnectionCard } from "./EmailConnectionCard";
import type {
  EmailConnectionCalendarResponse,
  EmailConnectionResponse,
  EmailProposalResponse,
} from "@/lib/api-client";

export interface EmailPanelProps {
  connections?: EmailConnectionResponse[];
  calendarsByConnectionId?: Record<string, EmailConnectionCalendarResponse[]>;
  calendarsLoadingByConnectionId?: Record<string, boolean>;
  calendarsErrorByConnectionId?: Record<string, string>;
  proposals?: EmailProposalResponse[];
  proposalsLoading?: boolean;
  proposalsError?: string | null;
  highlightedProposalId?: string | null;
  isLoading?: boolean;
  onConnectGmail?: () => void;
  onSync?: (connectionId: string) => void;
  onDisconnect?: (connectionId: string) => void;
  onUpdateSyncInterval?: (connectionId: string, minutes: number) => void;
  onUpdateMarkRead?: (connectionId: string, markRead: boolean) => void;
  onToggleCalendarSync?: (connectionId: string, enabled: boolean) => void;
  onUpdateCalendarSelection?: (
    connectionId: string,
    calendarIds: string[],
  ) => void;
  onGenerateProposals?: () => void;
  onConfirmProposal?: (proposalId: string) => void;
  onDismissProposal?: (proposalId: string) => void;
  proposalBusyId?: string | null;
  isGeneratingProposals?: boolean;
  syncingConnectionId?: string | null;
  className?: string;
}

export function EmailPanel({
  connections = [],
  calendarsByConnectionId = {},
  calendarsLoadingByConnectionId = {},
  calendarsErrorByConnectionId = {},
  proposals = [],
  proposalsLoading,
  proposalsError,
  highlightedProposalId,
  isLoading,
  onConnectGmail,
  onSync,
  onDisconnect,
  onUpdateSyncInterval,
  onUpdateMarkRead,
  onToggleCalendarSync,
  onUpdateCalendarSelection,
  onGenerateProposals,
  onConfirmProposal,
  onDismissProposal,
  proposalBusyId,
  isGeneratingProposals,
  syncingConnectionId,
  className,
}: EmailPanelProps) {
  const activeConnections = connections.filter((c) => c.is_active);
  const pendingProposals = proposals.filter((proposal) => proposal.status === "pending");
  const proposalTypeLabel = (value: string) => {
    if (value === "Proposal.RescheduleMeeting") return "Meeting reschedule";
    if (value === "Proposal.PersonalRequest") return "Personal request";
    return value;
  };

  return (
    <div className={cn("space-y-6", className)}>
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">
          3rd Party Sync
        </h2>
        <p className="text-xs text-text-subtle">
          Verbinde Google Workspace, um E-Mails und Kalender in Senticor Project
          zu synchronisieren.
        </p>
      </section>

      <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary">
              Copilot Proposals
            </h3>
            <p className="text-xs text-text-subtle">
              Vorschläge aus E-Mail- und Kalender-Kontext zur Bestätigung.
            </p>
          </div>
          <button
            type="button"
            onClick={onGenerateProposals}
            disabled={isGeneratingProposals}
            className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-paper-100 disabled:opacity-50"
          >
            <Icon
              name="auto_awesome"
              size={14}
              className={cn(isGeneratingProposals && "animate-spin")}
            />
            Vorschläge generieren
          </button>
        </div>

        {proposalsLoading && (
          <p className="text-xs text-text-muted">Vorschläge werden geladen...</p>
        )}
        {proposalsError && (
          <p className="rounded-[var(--radius-sm)] bg-status-error/10 px-2 py-1 text-xs text-status-error">
            {proposalsError}
          </p>
        )}
        {!proposalsLoading && !proposalsError && pendingProposals.length === 0 && (
          <p className="text-xs text-text-muted">
            Keine offenen Vorschläge.
          </p>
        )}
        {!proposalsLoading && !proposalsError && pendingProposals.length > 0 && (
          <div className="space-y-2">
            {pendingProposals.map((proposal) => {
              const isBusy = proposalBusyId === proposal.proposal_id;
              return (
                <article
                  key={proposal.proposal_id}
                  className={cn(
                    "rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2",
                    highlightedProposalId === proposal.proposal_id &&
                      "border-blueprint-400 ring-1 ring-blueprint-300/70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-xs font-semibold text-text-primary">
                        {proposalTypeLabel(proposal.proposal_type)}
                      </p>
                      <p className="text-xs text-text-muted">{proposal.why}</p>
                      <p className="text-[11px] text-text-subtle">
                        Confidence: {proposal.confidence}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onConfirmProposal?.(proposal.proposal_id)}
                        disabled={isBusy}
                        className="rounded-[var(--radius-sm)] bg-blueprint-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blueprint-700 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => onDismissProposal?.(proposal.proposal_id)}
                        disabled={isBusy}
                        className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-paper-100 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
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
            Keine Drittanbieter-Verbindung eingerichtet
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
              availableCalendars={
                calendarsByConnectionId[conn.connection_id] ?? []
              }
              calendarsLoading={
                calendarsLoadingByConnectionId[conn.connection_id]
              }
              calendarLoadError={
                calendarsErrorByConnectionId[conn.connection_id]
              }
              onSync={() => onSync?.(conn.connection_id)}
              onDisconnect={() => onDisconnect?.(conn.connection_id)}
              onUpdateSyncInterval={(minutes) =>
                onUpdateSyncInterval?.(conn.connection_id, minutes)
              }
              onUpdateMarkRead={(markRead) =>
                onUpdateMarkRead?.(conn.connection_id, markRead)
              }
              onToggleCalendarSync={(enabled) =>
                onToggleCalendarSync?.(conn.connection_id, enabled)
              }
              onUpdateCalendarSelection={(calendarIds) =>
                onUpdateCalendarSelection?.(conn.connection_id, calendarIds)
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
