import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { AgentApi } from "@/lib/api-client";
import type {
  AgentSettingsResponse,
  AgentContainerStatusResponse,
} from "@/lib/api-client";
import {
  useAgentSettings,
  useUpdateAgentSettings,
  useDeleteAgentApiKey,
  useAgentContainerStatus,
  useStopContainer,
  useRestartContainer,
  useHardRefreshContainer,
} from "./use-agent-settings";

vi.mock("@/lib/api-client", () => ({
  AgentApi: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    deleteApiKey: vi.fn(),
    getContainerStatus: vi.fn(),
    stopContainer: vi.fn(),
    restartContainer: vi.fn(),
    hardRefreshContainer: vi.fn(),
  },
}));

const mocked = vi.mocked(AgentApi);

const SETTINGS: AgentSettingsResponse = {
  agentBackend: "haystack",
  provider: "openrouter",
  hasApiKey: true,
  model: "gpt-4",
  containerStatus: null,
  containerError: null,
};

const CONTAINER_STATUS: AgentContainerStatusResponse = {
  status: "running",
  url: "http://localhost:8002",
  error: null,
  startedAt: "2025-01-01T00:00:00Z",
  lastActivityAt: "2025-01-01T00:00:00Z",
  port: 8002,
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
// Query hooks
// ---------------------------------------------------------------------------

describe("useAgentSettings", () => {
  it("fetches agent settings", async () => {
    mocked.getSettings.mockResolvedValue(SETTINGS);

    const { result } = renderHook(() => useAgentSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SETTINGS);
    expect(mocked.getSettings).toHaveBeenCalledOnce();
  });
});

describe("useAgentContainerStatus", () => {
  it("fetches container status when enabled", async () => {
    mocked.getContainerStatus.mockResolvedValue(CONTAINER_STATUS);

    const { result } = renderHook(() => useAgentContainerStatus(true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(CONTAINER_STATUS);
    expect(mocked.getContainerStatus).toHaveBeenCalledOnce();
  });

  it("does not fetch when disabled", () => {
    const { result } = renderHook(() => useAgentContainerStatus(false), {
      wrapper,
    });

    expect(result.current.isFetching).toBe(false);
    expect(mocked.getContainerStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

describe("useUpdateAgentSettings", () => {
  it("calls updateSettings with payload", async () => {
    mocked.updateSettings.mockResolvedValue(SETTINGS);

    const { result } = renderHook(() => useUpdateAgentSettings(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ model: "claude-3.5-sonnet" });
    });

    expect(mocked.updateSettings).toHaveBeenCalledWith({
      model: "claude-3.5-sonnet",
    });
  });
});

describe("useDeleteAgentApiKey", () => {
  it("calls deleteApiKey", async () => {
    mocked.deleteApiKey.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useDeleteAgentApiKey(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocked.deleteApiKey).toHaveBeenCalledOnce();
  });
});

describe("useStopContainer", () => {
  it("calls stopContainer", async () => {
    mocked.stopContainer.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useStopContainer(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocked.stopContainer).toHaveBeenCalledOnce();
  });
});

describe("useRestartContainer", () => {
  it("calls restartContainer", async () => {
    mocked.restartContainer.mockResolvedValue({
      ok: true,
      url: "http://localhost:8002",
    });

    const { result } = renderHook(() => useRestartContainer(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocked.restartContainer).toHaveBeenCalledOnce();
  });
});

describe("useHardRefreshContainer", () => {
  it("calls hardRefreshContainer", async () => {
    mocked.hardRefreshContainer.mockResolvedValue({
      ok: true,
      removedWorkspace: true,
      removedRuntime: true,
    });

    const { result } = renderHook(() => useHardRefreshContainer(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocked.hardRefreshContainer).toHaveBeenCalledOnce();
  });
});
