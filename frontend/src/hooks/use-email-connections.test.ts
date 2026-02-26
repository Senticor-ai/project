import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { EmailApi } from "@/lib/api-client";
import type {
  EmailConnectionResponse,
  EmailConnectionUpdateRequest,
} from "@/lib/api-client";
import {
  useEmailConnections,
  useUpdateEmailConnection,
  useTriggerEmailSync,
  useDisconnectEmail,
} from "./use-email-connections";

vi.mock("@/lib/api-client", () => ({
  EmailApi: {
    listConnections: vi.fn(),
    updateConnection: vi.fn(),
    triggerSync: vi.fn(),
    disconnect: vi.fn(),
  },
}));

const mocked = vi.mocked(EmailApi);

const CONNECTION: EmailConnectionResponse = {
  connection_id: "conn-1",
  email_address: "alice@gmail.com",
  display_name: "Alice",
  auth_method: "oauth2",
  oauth_provider: "gmail",
  sync_interval_minutes: 15,
  sync_mark_read: false,
  last_sync_at: null,
  last_sync_error: null,
  last_sync_message_count: null,
  is_active: true,
  watch_active: false,
  watch_expires_at: null,
  created_at: "2025-01-01T00:00:00Z",
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Query hook
// ---------------------------------------------------------------------------

describe("useEmailConnections", () => {
  it("fetches connections", async () => {
    mocked.listConnections.mockResolvedValue([CONNECTION]);

    const { result } = renderHook(() => useEmailConnections(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([CONNECTION]);
    expect(mocked.listConnections).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

describe("useUpdateEmailConnection", () => {
  it("calls updateConnection with id and patch", async () => {
    mocked.updateConnection.mockResolvedValue(CONNECTION);

    const { result } = renderHook(() => useUpdateEmailConnection(), {
      wrapper,
    });

    const patch: EmailConnectionUpdateRequest = { sync_interval_minutes: 30 };
    await act(async () => {
      await result.current.mutateAsync({ id: "conn-1", patch });
    });

    expect(mocked.updateConnection).toHaveBeenCalledWith("conn-1", patch);
  });
});

describe("useTriggerEmailSync", () => {
  it("calls triggerSync with connection id", async () => {
    mocked.triggerSync.mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useTriggerEmailSync(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("conn-1");
    });

    expect(mocked.triggerSync).toHaveBeenCalledWith("conn-1");
  });
});

describe("useDisconnectEmail", () => {
  it("calls disconnect with connection id", async () => {
    mocked.disconnect.mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useDisconnectEmail(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("conn-1");
    });

    expect(mocked.disconnect).toHaveBeenCalledWith("conn-1");
  });
});
