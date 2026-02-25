import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastContext } from "@/lib/toast-context";
import { useProposalNotificationStream } from "./use-proposal-notification-stream";

const toastSpy = vi.fn();

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly url: string;
  readonly withCredentials: boolean;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  closed = false;

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = Boolean(init?.withCredentials);
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    const set = this.listeners.get(type);
    if (!set) return;
    set.delete(listener);
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  emitNamed(type: string, data: unknown) {
    const set = this.listeners.get(type);
    if (!set) return;
    const event = { data: JSON.stringify(data) } as MessageEvent;
    for (const listener of set) {
      listener(event);
    }
  }
}

type NotificationCall = {
  title: string;
  options?: NotificationOptions;
};

const notificationCalls: NotificationCall[] = [];

class MockNotification {
  static permission: NotificationPermission = "granted";
  onclick: (() => void) | null = null;

  constructor(title: string, options?: NotificationOptions) {
    notificationCalls.push({ title, options });
  }

  close() {}
}

type StorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function createStorageMock(): StorageMock {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) ?? null : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

function Harness() {
  useProposalNotificationStream();
  return null;
}

function renderHarness() {
  return render(
    <ToastContext.Provider
      value={{
        toast: toastSpy,
        dismiss: vi.fn(),
        toasts: [],
      }}
    >
      <Harness />
    </ToastContext.Provider>,
  );
}

beforeEach(() => {
  toastSpy.mockReset();
  notificationCalls.length = 0;
  MockEventSource.instances = [];
  vi.stubGlobal("localStorage", createStorageMock());
  setVisibilityState("visible");
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal("Notification", MockNotification);
  MockNotification.permission = "granted";
});

describe("useProposalNotificationStream", () => {
  it("shows urgent proposal toast with review action", () => {
    renderHarness();
    const source = MockEventSource.instances[0];
    expect(source).toBeDefined();
    if (!source) {
      throw new Error("EventSource not initialized");
    }

    source.emit({
      event_id: "evt-1",
      kind: "proposal_urgent_created",
      title: "Urgent reschedule request",
      body: "Meeting starts soon.",
      url: "/settings/email?proposal=1",
      payload: { proposal_id: "1" },
      created_at: "2026-02-25T18:00:00Z",
    });

    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy).toHaveBeenCalledWith(
      "Urgent reschedule request",
      "info",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Review" }),
        persistent: true,
      }),
    );
  });

  it("consumes named 'notification' SSE events", () => {
    renderHarness();
    const source = MockEventSource.instances[0];
    expect(source).toBeDefined();
    if (!source) {
      throw new Error("EventSource not initialized");
    }

    source.emitNamed("notification", {
      event_id: "evt-named",
      kind: "proposal_urgent_created",
      title: "Urgent reschedule request",
      body: "Meeting starts soon.",
      url: "/settings/email?proposal=named",
      payload: { proposal_id: "named" },
      created_at: "2026-02-25T18:00:00Z",
    });

    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy).toHaveBeenCalledWith(
      "Urgent reschedule request",
      "info",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Review" }),
        persistent: true,
      }),
    );
  });

  it("deduplicates by event_id", () => {
    renderHarness();
    const source = MockEventSource.instances[0];
    expect(source).toBeDefined();
    if (!source) {
      throw new Error("EventSource not initialized");
    }

    const event = {
      event_id: "evt-dup",
      kind: "proposal_urgent_created",
      title: "Urgent personal request",
      body: "Pick up kids early.",
      url: "/settings/email?proposal=2",
      payload: { proposal_id: "2" },
      created_at: "2026-02-25T18:01:00Z",
    };
    source.emit(event);
    source.emit(event);

    expect(toastSpy).toHaveBeenCalledTimes(1);
  });

  it("shows browser notification when tab is hidden and permission granted", () => {
    setVisibilityState("hidden");
    MockNotification.permission = "granted";
    renderHarness();
    const source = MockEventSource.instances[0];
    expect(source).toBeDefined();
    if (!source) {
      throw new Error("EventSource not initialized");
    }

    source.emit({
      event_id: "evt-hidden",
      kind: "proposal_urgent_created",
      title: "Urgent proposal",
      body: "Review now.",
      url: "/settings/email?proposal=3",
      payload: { proposal_id: "3" },
      created_at: "2026-02-25T18:02:00Z",
    });

    expect(notificationCalls).toHaveLength(1);
    expect(notificationCalls[0]?.title).toBe("Urgent proposal");
  });

  it("skips browser notification when permission is denied", () => {
    setVisibilityState("hidden");
    MockNotification.permission = "denied";
    renderHarness();
    const source = MockEventSource.instances[0];
    expect(source).toBeDefined();
    if (!source) {
      throw new Error("EventSource not initialized");
    }

    source.emit({
      event_id: "evt-denied",
      kind: "proposal_urgent_created",
      title: "Urgent proposal",
      body: "Review now.",
      url: "/settings/email?proposal=4",
      payload: { proposal_id: "4" },
      created_at: "2026-02-25T18:03:00Z",
    });

    expect(notificationCalls).toHaveLength(0);
  });
});
