import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ThingsApi } from "@/lib/api-client";
import type { ThingRecord, SyncResponse } from "@/lib/api-client";
import {
  useThings,
  useActions,
  useInboxItems,
  useProjects,
  useReferences,
} from "./use-things";

vi.mock("@/lib/api-client", () => ({
  ThingsApi: {
    sync: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  },
}));

const mockedThings = vi.mocked(ThingsApi);

function makeRecord(
  overrides: Partial<ThingRecord> & { thing: Record<string, unknown> },
): ThingRecord {
  return {
    thing_id: overrides.thing_id ?? crypto.randomUUID(),
    canonical_id:
      overrides.canonical_id ?? `urn:gtd:test:${crypto.randomUUID()}`,
    source: overrides.source ?? "test",
    created_at: overrides.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00Z",
    thing: overrides.thing,
  };
}

function makeSyncPage(
  items: ThingRecord[],
  has_more: boolean,
  next_cursor: string | null = null,
): SyncResponse {
  return {
    items,
    has_more,
    next_cursor,
    server_time: "2026-02-06T12:00:00Z",
  };
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

// -- Fixtures ----------------------------------------------------------------

const ACTION_RECORD = makeRecord({
  thing: {
    "@type": "gtd:Action",
    "@id": "urn:gtd:action:1",
    title: "Buy milk",
    bucket: "next",
    completedAt: null,
  },
});

const INBOX_RECORD = makeRecord({
  thing: {
    "@type": "gtd:InboxItem",
    "@id": "urn:gtd:inbox:1",
    title: "Random thought",
    bucket: "inbox",
    rawCapture: "Random thought",
  },
});

const PROJECT_RECORD = makeRecord({
  thing: {
    "@type": "gtd:Project",
    "@id": "urn:gtd:project:1",
    title: "Relaunch website",
    bucket: "project",
    desiredOutcome: "New site live",
    status: "active",
    actionIds: [],
  },
});

const REFERENCE_RECORD = makeRecord({
  thing: {
    "@type": "gtd:Reference",
    "@id": "urn:gtd:reference:1",
    title: "Style guide",
    bucket: "reference",
  },
});

// -- Tests -------------------------------------------------------------------

describe("useThings — cursor-based sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches a single page when has_more is false", async () => {
    mockedThings.sync.mockResolvedValue(
      makeSyncPage([ACTION_RECORD, INBOX_RECORD], false),
    );

    const { result } = renderHook(() => useThings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(mockedThings.sync).toHaveBeenCalledTimes(1);
    expect(mockedThings.sync).toHaveBeenCalledWith({
      limit: 5000,
      cursor: undefined,
    });
  });

  it("paginates through multiple pages using cursors", async () => {
    mockedThings.sync
      .mockResolvedValueOnce(
        makeSyncPage([ACTION_RECORD], true, "cursor-page-2"),
      )
      .mockResolvedValueOnce(
        makeSyncPage([INBOX_RECORD], true, "cursor-page-3"),
      )
      .mockResolvedValueOnce(makeSyncPage([PROJECT_RECORD], false));

    const { result } = renderHook(() => useThings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(3);
    expect(mockedThings.sync).toHaveBeenCalledTimes(3);
    expect(mockedThings.sync).toHaveBeenNthCalledWith(1, {
      limit: 5000,
      cursor: undefined,
    });
    expect(mockedThings.sync).toHaveBeenNthCalledWith(2, {
      limit: 5000,
      cursor: "cursor-page-2",
    });
    expect(mockedThings.sync).toHaveBeenNthCalledWith(3, {
      limit: 5000,
      cursor: "cursor-page-3",
    });
  });

  it("returns empty array when no items exist", async () => {
    mockedThings.sync.mockResolvedValue(makeSyncPage([], false));

    const { result } = renderHook(() => useThings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
    expect(mockedThings.sync).toHaveBeenCalledTimes(1);
  });
});

describe("derived hooks filter by @type", () => {
  const ALL_RECORDS = [
    ACTION_RECORD,
    INBOX_RECORD,
    PROJECT_RECORD,
    REFERENCE_RECORD,
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    mockedThings.sync.mockResolvedValue(makeSyncPage(ALL_RECORDS, false));
  });

  it("useActions returns only gtd:Action items", async () => {
    const { result } = renderHook(() => useActions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].title).toBe("Buy milk");
    expect(result.current.data[0].bucket).toBe("next");
  });

  it("useInboxItems returns only gtd:InboxItem items", async () => {
    const { result } = renderHook(() => useInboxItems(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].title).toBe("Random thought");
  });

  it("useProjects returns only gtd:Project items", async () => {
    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].title).toBe("Relaunch website");
  });

  it("useReferences returns only gtd:Reference items", async () => {
    const { result } = renderHook(() => useReferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].title).toBe("Style guide");
  });
});
