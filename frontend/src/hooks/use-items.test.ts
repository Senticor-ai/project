import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ItemsApi } from "@/lib/api-client";
import type { ItemRecord, SyncResponse } from "@/lib/api-client";
import {
  useItems,
  useActions,
  useInboxItems,
  useProjects,
  useReferences,
} from "./use-items";

vi.mock("@/lib/api-client", () => ({
  ItemsApi: {
    sync: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  },
}));

const mockedItems = vi.mocked(ItemsApi);

function makeRecord(
  overrides: Partial<ItemRecord> & { item: Record<string, unknown> },
): ItemRecord {
  return {
    item_id: overrides.item_id ?? crypto.randomUUID(),
    canonical_id:
      overrides.canonical_id ?? `urn:app:test:${crypto.randomUUID()}`,
    source: overrides.source ?? "test",
    created_at: overrides.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00Z",
    item: overrides.item,
  };
}

function makeSyncPage(
  items: ItemRecord[],
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

function pvFixture(propertyID: string, value: unknown) {
  return { "@type": "PropertyValue", propertyID, value };
}

const ACTION_RECORD = makeRecord({
  item: {
    "@type": "Action",
    "@id": "urn:app:action:1",
    _schemaVersion: 2,
    name: "Buy milk",
    keywords: [],
    dateCreated: "2026-01-01T00:00:00Z",
    dateModified: "2026-01-01T00:00:00Z",
    startTime: null,
    endTime: null,
    additionalProperty: [
      pvFixture("app:bucket", "next"),
      pvFixture("app:needsEnrichment", false),
      pvFixture("app:confidence", "high"),
      pvFixture("app:captureSource", { kind: "thought" }),
      pvFixture("app:contexts", []),
      pvFixture("app:isFocused", false),
      pvFixture("app:ports", []),
      pvFixture("app:typedReferences", []),
      pvFixture("app:provenanceHistory", []),
    ],
  },
});

const INBOX_RECORD = makeRecord({
  item: {
    "@type": "Action",
    "@id": "urn:app:inbox:1",
    _schemaVersion: 2,
    name: "Random thought",
    keywords: [],
    dateCreated: "2026-01-01T00:00:00Z",
    dateModified: "2026-01-01T00:00:00Z",
    startTime: null,
    endTime: null,
    additionalProperty: [
      pvFixture("app:bucket", "inbox"),
      pvFixture("app:rawCapture", "Random thought"),
      pvFixture("app:needsEnrichment", true),
      pvFixture("app:confidence", "medium"),
      pvFixture("app:captureSource", { kind: "thought" }),
      pvFixture("app:contexts", []),
      pvFixture("app:isFocused", false),
      pvFixture("app:ports", []),
      pvFixture("app:typedReferences", []),
      pvFixture("app:provenanceHistory", []),
    ],
  },
});

const PROJECT_RECORD = makeRecord({
  item: {
    "@type": "Project",
    "@id": "urn:app:project:1",
    _schemaVersion: 2,
    name: "Relaunch website",
    keywords: [],
    dateCreated: "2026-01-01T00:00:00Z",
    dateModified: "2026-01-01T00:00:00Z",
    hasPart: [],
    additionalProperty: [
      pvFixture("app:bucket", "project"),
      pvFixture("app:desiredOutcome", "New site live"),
      pvFixture("app:projectStatus", "active"),
      pvFixture("app:isFocused", false),
      pvFixture("app:needsEnrichment", false),
      pvFixture("app:confidence", "high"),
      pvFixture("app:captureSource", { kind: "thought" }),
      pvFixture("app:ports", []),
      pvFixture("app:typedReferences", []),
      pvFixture("app:provenanceHistory", []),
    ],
  },
});

const REFERENCE_RECORD = makeRecord({
  item: {
    "@type": "CreativeWork",
    "@id": "urn:app:reference:1",
    _schemaVersion: 2,
    name: "Style guide",
    keywords: [],
    dateCreated: "2026-01-01T00:00:00Z",
    dateModified: "2026-01-01T00:00:00Z",
    additionalProperty: [
      pvFixture("app:bucket", "reference"),
      pvFixture("app:needsEnrichment", false),
      pvFixture("app:confidence", "medium"),
      pvFixture("app:captureSource", { kind: "thought" }),
      pvFixture("app:ports", []),
      pvFixture("app:typedReferences", []),
      pvFixture("app:provenanceHistory", []),
    ],
  },
});

// -- Tests -------------------------------------------------------------------

describe("useItems — cursor-based sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches a single page when has_more is false", async () => {
    mockedItems.sync.mockResolvedValue(
      makeSyncPage([ACTION_RECORD, INBOX_RECORD], false),
    );

    const { result } = renderHook(() => useItems(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(mockedItems.sync).toHaveBeenCalledTimes(1);
    expect(mockedItems.sync).toHaveBeenCalledWith({
      limit: 5000,
      cursor: undefined,
      completed: "false",
    });
  });

  it("paginates through multiple pages using cursors", async () => {
    mockedItems.sync
      .mockResolvedValueOnce(
        makeSyncPage([ACTION_RECORD], true, "cursor-page-2"),
      )
      .mockResolvedValueOnce(
        makeSyncPage([INBOX_RECORD], true, "cursor-page-3"),
      )
      .mockResolvedValueOnce(makeSyncPage([PROJECT_RECORD], false));

    const { result } = renderHook(() => useItems(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(3);
    expect(mockedItems.sync).toHaveBeenCalledTimes(3);
    expect(mockedItems.sync).toHaveBeenNthCalledWith(1, {
      limit: 5000,
      cursor: undefined,
      completed: "false",
    });
    expect(mockedItems.sync).toHaveBeenNthCalledWith(2, {
      limit: 5000,
      cursor: "cursor-page-2",
      completed: "false",
    });
    expect(mockedItems.sync).toHaveBeenNthCalledWith(3, {
      limit: 5000,
      cursor: "cursor-page-3",
      completed: "false",
    });
  });

  it("returns empty array when no items exist", async () => {
    mockedItems.sync.mockResolvedValue(makeSyncPage([], false));

    const { result } = renderHook(() => useItems(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
    expect(mockedItems.sync).toHaveBeenCalledTimes(1);
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
    mockedItems.sync.mockResolvedValue(makeSyncPage(ALL_RECORDS, false));
  });

  it("useActions returns only Action items", async () => {
    const { result } = renderHook(() => useActions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].name).toBe("Buy milk");
    expect(result.current.data[0].bucket).toBe("next");
  });

  it("useInboxItems returns only ActionItem items", async () => {
    const { result } = renderHook(() => useInboxItems(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].name).toBe("Random thought");
  });

  it("useProjects returns only Project items", async () => {
    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].name).toBe("Relaunch website");
  });

  it("useReferences returns only CreativeWork items", async () => {
    const { result } = renderHook(() => useReferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].name).toBe("Style guide");
  });
});
