import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ThingsApi } from "@/lib/api-client";
import type { ThingRecord } from "@/lib/api-client";
import {
  useCaptureInbox,
  useTriageItem,
  useCompleteAction,
  useToggleFocus,
  useMoveAction,
  useUpdateItem,
  useAddAction,
  useAddReference,
  useAddProjectAction,
  useArchiveReference,
} from "./use-mutations";
import { THINGS_QUERY_KEY } from "./use-things";
import type { Thing } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

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

const mocked = vi.mocked(ThingsApi);

function pv(propertyID: string, value: unknown) {
  return { "@type": "PropertyValue", propertyID, value };
}

function makeRecord(overrides: Partial<ThingRecord>): ThingRecord {
  return {
    thing_id: overrides.thing_id ?? "tid-1",
    canonical_id: overrides.canonical_id ?? "urn:app:test:1",
    source: overrides.source ?? "test",
    created_at: overrides.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00Z",
    thing: overrides.thing ?? {},
  };
}

const ACTION_RECORD = makeRecord({
  thing_id: "tid-action-1",
  canonical_id: "urn:app:action:1",
  thing: {
    "@type": "Action",
    "@id": "urn:app:action:1",
    name: "Buy milk",
    endTime: null,
    additionalProperty: [
      pv("app:bucket", "next"),
      pv("app:isFocused", false),
    ],
  },
});

const COMPLETED_RECORD = makeRecord({
  thing_id: "tid-completed-1",
  canonical_id: "urn:app:completed:1",
  thing: {
    "@type": "Action",
    "@id": "urn:app:completed:1",
    name: "Done task",
    endTime: "2026-01-01T00:00:00Z",
    additionalProperty: [pv("app:bucket", "next"), pv("app:isFocused", false)],
  },
});

const REFERENCE_RECORD = makeRecord({
  thing_id: "tid-ref-1",
  canonical_id: "urn:app:reference:1",
  thing: {
    "@type": "CreativeWork",
    "@id": "urn:app:reference:1",
    name: "Style guide",
    additionalProperty: [pv("app:bucket", "reference")],
  },
});

function createWrapper(initialData?: ThingRecord[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (initialData) {
    qc.setQueryData(THINGS_QUERY_KEY, initialData);
  }
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// useCaptureInbox
// ---------------------------------------------------------------------------

describe("useCaptureInbox", () => {
  it("calls ThingsApi.create with inbox JSON-LD", async () => {
    mocked.create.mockResolvedValue(makeRecord({ thing: {} }));

    const { result } = renderHook(() => useCaptureInbox(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.mutate("Buy groceries"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.create).toHaveBeenCalledTimes(1);
    const [jsonLd, source] = mocked.create.mock.calls[0];
    expect(jsonLd).toHaveProperty("@type", "Thing");
    expect(jsonLd).not.toHaveProperty("name");
    const props = jsonLd.additionalProperty as Array<{ propertyID: string; value: unknown }>;
    expect(props.find((p) => p.propertyID === "app:rawCapture")?.value).toBe("Buy groceries");
    expect(source).toBe("manual");
  });
});

// ---------------------------------------------------------------------------
// useAddAction
// ---------------------------------------------------------------------------

describe("useAddAction", () => {
  it("creates action with specified bucket", async () => {
    mocked.create.mockResolvedValue(makeRecord({ thing: {} }));

    const { result } = renderHook(() => useAddAction(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.mutate({ title: "Call Bob", bucket: "next" }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [jsonLd] = mocked.create.mock.calls[0];
    expect(jsonLd).toHaveProperty("@type", "Action");
    expect(jsonLd).not.toHaveProperty("name");
    const props = jsonLd.additionalProperty as Array<{ propertyID: string; value: unknown }>;
    expect(props.find((p) => p.propertyID === "app:rawCapture")?.value).toBe("Call Bob");
  });
});

// ---------------------------------------------------------------------------
// useAddReference
// ---------------------------------------------------------------------------

describe("useAddReference", () => {
  it("creates CreativeWork reference", async () => {
    mocked.create.mockResolvedValue(makeRecord({ thing: {} }));

    const { result } = renderHook(() => useAddReference(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.mutate("Style guide"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [jsonLd] = mocked.create.mock.calls[0];
    expect(jsonLd).toHaveProperty("@type", "CreativeWork");
    expect(jsonLd).toHaveProperty("name", "Style guide");
  });
});

// ---------------------------------------------------------------------------
// useCompleteAction
// ---------------------------------------------------------------------------

describe("useCompleteAction", () => {
  it("sets endTime when completing an action", async () => {
    mocked.update.mockResolvedValue(ACTION_RECORD);

    const { result } = renderHook(() => useCompleteAction(), {
      wrapper: createWrapper([ACTION_RECORD]),
    });

    act(() =>
      result.current.mutate("urn:app:action:1" as CanonicalId),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.update).toHaveBeenCalledTimes(1);
    const [thingId, patch] = mocked.update.mock.calls[0];
    expect(thingId).toBe("tid-action-1");
    expect(patch.endTime).toBeTruthy(); // ISO date string
  });

  it("clears endTime when uncompleting", async () => {
    mocked.update.mockResolvedValue(COMPLETED_RECORD);

    const { result } = renderHook(() => useCompleteAction(), {
      wrapper: createWrapper([COMPLETED_RECORD]),
    });

    act(() =>
      result.current.mutate("urn:app:completed:1" as CanonicalId),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, patch] = mocked.update.mock.calls[0];
    expect(patch.endTime).toBeNull();
  });

  it("throws when canonical_id not in cache", async () => {
    const { result } = renderHook(() => useCompleteAction(), {
      wrapper: createWrapper([]),
    });

    act(() =>
      result.current.mutate("urn:app:missing:1" as CanonicalId),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// useToggleFocus
// ---------------------------------------------------------------------------

describe("useToggleFocus", () => {
  it("toggles isFocused property", async () => {
    mocked.update.mockResolvedValue(ACTION_RECORD);

    const { result } = renderHook(() => useToggleFocus(), {
      wrapper: createWrapper([ACTION_RECORD]),
    });

    act(() =>
      result.current.mutate("urn:app:action:1" as CanonicalId),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, patch] = mocked.update.mock.calls[0];
    expect(patch.additionalProperty).toEqual([
      { "@type": "PropertyValue", propertyID: "app:isFocused", value: true },
    ]);
  });
});

// ---------------------------------------------------------------------------
// useMoveAction
// ---------------------------------------------------------------------------

describe("useMoveAction", () => {
  it("updates bucket property", async () => {
    mocked.update.mockResolvedValue(ACTION_RECORD);

    const { result } = renderHook(() => useMoveAction(), {
      wrapper: createWrapper([ACTION_RECORD]),
    });

    act(() =>
      result.current.mutate({
        canonicalId: "urn:app:action:1" as CanonicalId,
        bucket: "someday",
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, patch] = mocked.update.mock.calls[0];
    expect(patch.additionalProperty).toEqual([
      { "@type": "PropertyValue", propertyID: "app:bucket", value: "someday" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// useUpdateItem
// ---------------------------------------------------------------------------

describe("useUpdateItem", () => {
  it("sends arbitrary patch to ThingsApi.update", async () => {
    mocked.update.mockResolvedValue(ACTION_RECORD);

    const { result } = renderHook(() => useUpdateItem(), {
      wrapper: createWrapper([ACTION_RECORD]),
    });

    act(() =>
      result.current.mutate({
        canonicalId: "urn:app:action:1" as CanonicalId,
        patch: { name: "Updated title" },
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [thingId, patch] = mocked.update.mock.calls[0];
    expect(thingId).toBe("tid-action-1");
    expect(patch).toEqual({ name: "Updated title" });
  });
});

// ---------------------------------------------------------------------------
// useTriageItem
// ---------------------------------------------------------------------------

describe("useTriageItem", () => {
  it("archives when targetBucket is archive", async () => {
    mocked.archive.mockResolvedValue({
      thing_id: "tid-action-1",
      archived_at: "2026-01-01",
      ok: true,
    });

    const { result } = renderHook(() => useTriageItem(), {
      wrapper: createWrapper([ACTION_RECORD]),
    });

    const item: Thing = {
      id: "urn:app:action:1" as CanonicalId,
      name: "Buy milk",
      type: "inbox",
      bucket: "inbox",
      rawCapture: "Buy milk",
      keywords: [],
      contexts: [],
      needsEnrichment: false,
      confidence: "high",
      captureSource: { kind: "thought" },
      dateCreated: "2026-01-01",
      dateModified: "2026-01-01",
      isFocused: false,
      ports: [],
      typedReferences: [],
      provenanceHistory: [],
    };

    act(() =>
      result.current.mutate({
        item,
        result: { targetBucket: "archive" },
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.archive).toHaveBeenCalledWith("tid-action-1");
  });
});

// ---------------------------------------------------------------------------
// useAddProjectAction
// ---------------------------------------------------------------------------

describe("useAddProjectAction", () => {
  it("creates action linked to project", async () => {
    mocked.create.mockResolvedValue(makeRecord({ thing: {} }));

    const { result } = renderHook(() => useAddProjectAction(), {
      wrapper: createWrapper(),
    });

    act(() =>
      result.current.mutate({
        projectId: "urn:app:project:1" as CanonicalId,
        title: "Design mockups",
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [jsonLd] = mocked.create.mock.calls[0];
    expect(jsonLd).toHaveProperty("@type", "Action");
    expect(jsonLd).not.toHaveProperty("name");
    const props = jsonLd.additionalProperty as Array<{ propertyID: string; value: unknown }>;
    expect(props.find((p) => p.propertyID === "app:rawCapture")?.value).toBe("Design mockups");
    expect(jsonLd).toHaveProperty("isPartOf", { "@id": "urn:app:project:1" });
  });
});

// ---------------------------------------------------------------------------
// useArchiveReference
// ---------------------------------------------------------------------------

describe("useArchiveReference", () => {
  it("archives a reference by canonical_id", async () => {
    mocked.archive.mockResolvedValue({
      thing_id: "tid-ref-1",
      archived_at: "2026-01-01",
      ok: true,
    });

    const { result } = renderHook(() => useArchiveReference(), {
      wrapper: createWrapper([REFERENCE_RECORD]),
    });

    act(() =>
      result.current.mutate("urn:app:reference:1" as CanonicalId),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.archive).toHaveBeenCalledWith("tid-ref-1");
  });
});
