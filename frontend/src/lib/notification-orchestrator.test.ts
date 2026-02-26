import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  NotificationOrchestrator,
  type NotificationEvent,
} from "./notification-orchestrator";
import type { ToastContextValue } from "./toast-context";

function createMockToast(): ToastContextValue {
  return {
    toasts: [],
    toast: vi.fn(),
    dismiss: vi.fn(),
  };
}

function createEvent(
  overrides: Partial<NotificationEvent> = {},
): NotificationEvent {
  return {
    event_id: `evt-${Date.now()}`,
    kind: "proposal_urgent_created",
    severity: "critical",
    title: "Urgent: meeting update",
    body: "Alex requested moving your 4:00 PM meeting.",
    url: "/settings/email?proposal=123",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("NotificationOrchestrator", () => {
  let originalNotification: typeof globalThis.Notification;

  beforeEach(() => {
    originalNotification = globalThis.Notification;
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
  });

  it("dispatches urgent events to toast", () => {
    const toast = createMockToast();
    const orchestrator = new NotificationOrchestrator(toast);

    const event = createEvent();
    orchestrator.dispatch(event);

    expect(toast.toast).toHaveBeenCalledWith(
      event.title,
      "info",
      expect.objectContaining({ persistent: true }),
    );
  });

  it("deduplicates events by event_id", () => {
    const toast = createMockToast();
    const orchestrator = new NotificationOrchestrator(toast);

    const event = createEvent({ event_id: "dup-1" });
    orchestrator.dispatch(event);
    orchestrator.dispatch(event); // same event_id

    expect(toast.toast).toHaveBeenCalledTimes(1);
  });

  it("shows browser notification when tab is hidden and permission granted", () => {
    const toast = createMockToast();
    const orchestrator = new NotificationOrchestrator(toast);

    const mockNotificationConstructor = vi.fn();
    // @ts-expect-error Mocking browser Notification API
    globalThis.Notification = mockNotificationConstructor;
    // @ts-expect-error Mocking static property
    globalThis.Notification.permission = "granted";
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });

    const event = createEvent();
    orchestrator.dispatch(event);

    expect(mockNotificationConstructor).toHaveBeenCalledWith(
      event.title,
      expect.objectContaining({ body: event.body }),
    );

    // Restore
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  it("skips browser notification when tab is visible", () => {
    const toast = createMockToast();
    const orchestrator = new NotificationOrchestrator(toast);

    const mockNotificationConstructor = vi.fn();
    // @ts-expect-error Mocking browser Notification API
    globalThis.Notification = mockNotificationConstructor;
    // @ts-expect-error Mocking static property
    globalThis.Notification.permission = "granted";
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    orchestrator.dispatch(createEvent());

    expect(mockNotificationConstructor).not.toHaveBeenCalled();
  });

  it("falls back to toast-only when browser notification permission denied", () => {
    const toast = createMockToast();
    const orchestrator = new NotificationOrchestrator(toast);

    const mockNotificationConstructor = vi.fn();
    // @ts-expect-error Mocking browser Notification API
    globalThis.Notification = mockNotificationConstructor;
    // @ts-expect-error Mocking static property
    globalThis.Notification.permission = "denied";

    orchestrator.dispatch(createEvent());

    // Toast should still fire
    expect(toast.toast).toHaveBeenCalledTimes(1);
    // Browser notification should NOT fire
    expect(mockNotificationConstructor).not.toHaveBeenCalled();
  });

  it("handles non-urgent events without browser notification", () => {
    const toast = createMockToast();
    const orchestrator = new NotificationOrchestrator(toast);

    const event = createEvent({ kind: "proposal_created", severity: "info" });
    orchestrator.dispatch(event);

    // Non-urgent events still get a toast but not persistent
    expect(toast.toast).toHaveBeenCalledWith(
      event.title,
      "info",
      expect.not.objectContaining({ persistent: true }),
    );
  });

  it("calls onUrgentProposal callback when provided", () => {
    const toast = createMockToast();
    const onUrgent = vi.fn();
    const orchestrator = new NotificationOrchestrator(toast, {
      onUrgentProposal: onUrgent,
    });

    const event = createEvent();
    orchestrator.dispatch(event);

    expect(onUrgent).toHaveBeenCalledWith(event);
  });

  it("evicts oldest seen event_ids when max capacity reached", () => {
    const toast = createMockToast();
    const orchestrator = new NotificationOrchestrator(toast);

    // Dispatch 201 unique events (exceeds MAX_SEEN_EVENT_IDS of 200)
    for (let i = 0; i < 201; i++) {
      orchestrator.dispatch(createEvent({ event_id: `evt-${i}` }));
    }

    // The first event_id should have been evicted, so re-dispatching it should trigger
    (toast.toast as ReturnType<typeof vi.fn>).mockClear();
    orchestrator.dispatch(createEvent({ event_id: "evt-0" }));
    expect(toast.toast).toHaveBeenCalledTimes(1);
  });
});
