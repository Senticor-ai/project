import { useContext, useEffect, useRef } from "react";
import { NotificationsApi } from "@/lib/api-client";
import { ToastContext } from "@/lib/toast-context";

type NotificationEvent = {
  event_id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  payload?: Record<string, unknown>;
  created_at: string;
};

const CURSOR_STORAGE_KEY = "notifications.cursor";
const MAX_SEEN_EVENT_IDS = 200;

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

function isUrgentProposalEvent(kind: string) {
  return kind === "proposal_urgent_created";
}

function maybeShowBrowserNotification(event: NotificationEvent) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;

  const browserNotification = new Notification(event.title, {
    body: event.body,
    data: { event_id: event.event_id, url: event.url },
  });
  browserNotification.onclick = () => {
    if (event.url) {
      window.location.assign(event.url);
    }
    window.focus();
    browserNotification.close();
  };
}

export function useProposalNotificationStream() {
  const toastContext = useContext(ToastContext);
  const seenEventIds = useRef(new Set<string>());
  const seenOrder = useRef<string[]>([]);

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

    const markSeen = (eventId: string): boolean => {
      if (seenEventIds.current.has(eventId)) {
        return false;
      }
      seenEventIds.current.add(eventId);
      seenOrder.current.push(eventId);
      if (seenOrder.current.length > MAX_SEEN_EVENT_IDS) {
        const oldest = seenOrder.current.shift();
        if (oldest) {
          seenEventIds.current.delete(oldest);
        }
      }
      return true;
    };

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
        if (!markSeen(event.event_id)) return;

        try {
          localStorage.setItem(CURSOR_STORAGE_KEY, event.created_at);
        } catch {
          // Ignore storage failures and continue streaming.
        }

        if (!isUrgentProposalEvent(event.kind)) return;

        toastContext.toast(event.title, "info", {
          action: event.url
            ? {
                label: "Review",
                onClick: () => window.location.assign(event.url || "/settings/email"),
              }
            : undefined,
          persistent: true,
        });
        maybeShowBrowserNotification(event);
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
  }, [toastContext]);
}
