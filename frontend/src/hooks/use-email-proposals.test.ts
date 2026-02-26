import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { EmailApi } from "@/lib/api-client";
import type { EmailProposalResponse } from "@/lib/api-client";
import {
  useEmailProposals,
  useGenerateEmailProposals,
  useConfirmEmailProposal,
  useDismissEmailProposal,
} from "./use-email-proposals";

vi.mock("@/lib/api-client", () => ({
  EmailApi: {
    listProposals: vi.fn(),
    generateProposals: vi.fn(),
    confirmProposal: vi.fn(),
    dismissProposal: vi.fn(),
  },
}));

const mocked = vi.mocked(EmailApi);

const PROPOSAL: EmailProposalResponse = {
  proposal_id: "prop-1",
  proposal_type: "auto_reply",
  why: "Urgent message",
  confidence: "high",
  requires_confirmation: true,
  suggested_actions: ["reply"],
  status: "pending",
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

describe("useEmailProposals", () => {
  it("fetches proposals", async () => {
    mocked.listProposals.mockResolvedValue([PROPOSAL]);

    const { result } = renderHook(() => useEmailProposals(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([PROPOSAL]);
    expect(mocked.listProposals).toHaveBeenCalledOnce();
  });

  it("does not fetch when disabled", () => {
    const { result } = renderHook(() => useEmailProposals(false), { wrapper });

    expect(result.current.isFetching).toBe(false);
    expect(mocked.listProposals).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

describe("useGenerateEmailProposals", () => {
  it("calls generateProposals", async () => {
    mocked.generateProposals.mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useGenerateEmailProposals(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocked.generateProposals).toHaveBeenCalledOnce();
  });
});

describe("useConfirmEmailProposal", () => {
  it("calls confirmProposal with proposal id", async () => {
    mocked.confirmProposal.mockResolvedValue({
      proposal_id: "prop-1",
      status: "confirmed",
    });

    const { result } = renderHook(() => useConfirmEmailProposal(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync("prop-1");
    });

    expect(mocked.confirmProposal).toHaveBeenCalledWith("prop-1");
  });
});

describe("useDismissEmailProposal", () => {
  it("calls dismissProposal with proposal id", async () => {
    mocked.dismissProposal.mockResolvedValue({
      proposal_id: "prop-1",
      status: "dismissed",
    });

    const { result } = renderHook(() => useDismissEmailProposal(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync("prop-1");
    });

    expect(mocked.dismissProposal).toHaveBeenCalledWith("prop-1");
  });
});
