import type { ToastContextValue } from "./toast-context";

export type NotificationEvent = {
  event_id: string;
  kind: string;
  severity?: "info" | "warning" | "critical";
  title: string;
  body: string;
  url: string | null;
  payload?: Record<string, unknown>;
  created_at: string;
};

const MAX_SEEN_EVENT_IDS = 200;

function isUrgent(event: NotificationEvent): boolean {
  return (
    event.kind === "proposal_urgent_created" || event.severity === "critical"
  );
}

type OrchestratorOptions = {
  onUrgentProposal?: (event: NotificationEvent) => void;
};

/**
 * Centralized notification dispatcher that routes events to:
 * 1. In-app toast (always)
 * 2. Browser Notification API (when tab hidden + permission granted + urgent)
 * Deduplicates by event_id across all channels.
 */
export class NotificationOrchestrator {
  private seenEventIds = new Set<string>();
  private seenOrder: string[] = [];
  private toast: ToastContextValue;
  private options: OrchestratorOptions;

  constructor(toast: ToastContextValue, options?: OrchestratorOptions) {
    this.toast = toast;
    this.options = options ?? {};
  }

  dispatch(event: NotificationEvent): void {
    // Dedup by event_id
    if (this.seenEventIds.has(event.event_id)) return;
    this.markSeen(event.event_id);

    const urgent = isUrgent(event);

    // Callback for urgent proposals
    if (urgent && this.options.onUrgentProposal) {
      this.options.onUrgentProposal(event);
    }

    // Toast — always
    this.toast.toast(
      event.title,
      "info",
      urgent
        ? {
            persistent: true,
            action: event.url
              ? {
                  label: "Review",
                  onClick: () => {
                    if (this.options.onUrgentProposal) {
                      this.options.onUrgentProposal(event);
                      return;
                    }
                    window.location.assign(event.url || "/settings/email");
                  },
                }
              : undefined,
          }
        : {},
    );

    // Browser notification — only for urgent, only when tab hidden
    if (urgent) {
      this.maybeShowBrowserNotification(event);
    }
  }

  private markSeen(eventId: string): void {
    this.seenEventIds.add(eventId);
    this.seenOrder.push(eventId);
    if (this.seenOrder.length > MAX_SEEN_EVENT_IDS) {
      const oldest = this.seenOrder.shift();
      if (oldest) this.seenEventIds.delete(oldest);
    }
  }

  private maybeShowBrowserNotification(event: NotificationEvent): void {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;

    const browserNotification = new Notification(event.title, {
      body: event.body,
      data: { event_id: event.event_id, url: event.url },
    });
    browserNotification.onclick = () => {
      if (this.options.onUrgentProposal) {
        this.options.onUrgentProposal(event);
      } else if (event.url) {
        window.location.assign(event.url);
      }
      window.focus();
      browserNotification.close();
    };
  }
}
