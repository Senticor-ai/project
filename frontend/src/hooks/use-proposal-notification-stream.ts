import { useContext, useEffect, useRef } from "react";
import { NotificationsApi } from "@/lib/api-client";
import { ToastContext } from "@/lib/toast-context";
import {
  NotificationOrchestrator,
  type NotificationEvent,
} from "@/lib/notification-orchestrator";

const CURSOR_STORAGE_KEY = "notifications.cursor";

function parseNotificationEvent(raw: string): NotificationEvent | null {
  try {
    const parsed = JSON.parse(raw) as NotificationEvent;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.event_id || !parsed.kind) return null;
    return parsed;
  } catch {
    return null;
  }
}

type ProposalNotificationStreamOptions = {
  onUrgentProposal?: (event: NotificationEvent) => void;
};

export function useProposalNotificationStream(
  options?: ProposalNotificationStreamOptions,
) {
  const toastContext = useContext(ToastContext);
  const onUrgentProposal = options?.onUrgentProposal;
  const orchestratorRef = useRef<NotificationOrchestrator | null>(null);

  useEffect(() => {
    if (!toastContext) return;
    orchestratorRef.current = new NotificationOrchestrator(toastContext, {
      onUrgentProposal,
    });
  }, [toastContext, onUrgentProposal]);

  useEffect(() => {
    if (!toastContext) {
      return;
    }
    if (typeof EventSource === "undefined") {
      return;
    }
    let source: EventSource | null = null;
    let notificationListener: ((event: MessageEvent) => void) | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      let cursor: string | undefined;
      try {
        cursor = localStorage.getItem(CURSOR_STORAGE_KEY) ?? undefined;
      } catch {
        cursor = undefined;
      }
      const url = NotificationsApi.streamUrl({ cursor });
      source = new EventSource(url, { withCredentials: true });

      const handlePayload = (rawData: unknown) => {
        const event = parseNotificationEvent(String(rawData ?? ""));
        if (!event) return;

        try {
          localStorage.setItem(CURSOR_STORAGE_KEY, event.created_at);
        } catch {
          // Ignore storage failures and continue streaming.
        }

        orchestratorRef.current?.dispatch(event);
      };
      source.onmessage = (message) => {
        handlePayload(message.data);
      };
      notificationListener = (message: MessageEvent) => {
        handlePayload(message.data);
      };
      source.addEventListener("notification", notificationListener);

      source.onerror = () => {
        if (source) {
          if (notificationListener) {
            source.removeEventListener("notification", notificationListener);
          }
          source.close();
          source = null;
        }
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 2_000);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (source) {
        if (notificationListener) {
          source.removeEventListener("notification", notificationListener);
        }
        source.close();
      }
    };
  }, [toastContext, onUrgentProposal]);
}
