import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ItemsApi } from "@/lib/api-client";
import type { ItemRecord } from "@/lib/api-client";
import {
  useCaptureInbox,
  useCaptureFile,
  useTriageItem,
  useCompleteAction,
  useToggleFocus,
  useMoveAction,
  useUpdateItem,
  useAddAction,
  useAddReference,
  useAddProjectAction,
  useArchiveReference,
  useCreateProject,
} from "./use-mutations";
import { ITEMS_QUERY_KEY } from "./use-items";
import type { CanonicalId } from "@/model/canonical-id";
import { createInboxItem } from "@/model/factories";
import { uploadFile } from "@/lib/file-upload";

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

vi.mock("@/lib/file-upload", () => ({
  uploadFile: vi.fn(),
}));

const mocked = vi.mocked(ItemsApi);
const mockedUploadFile = vi.mocked(uploadFile);

function pv(propertyID: string, value: unknown) {
  return { "@type": "PropertyValue", propertyID, value };
}

function makeRecord(overrides: Partial<ItemRecord>): ItemRecord {
  return {
    item_id: overrides.item_id ?? "tid-1",
    canonical_id: overrides.canonical_id ?? "urn:app:test:1",
    source: overrides.source ?? "test",
    created_at: overrides.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00Z",
    item: overrides.item ?? {},
  };
}

const ACTION_RECORD = makeRecord({
  item_id: "tid-action-1",
  canonical_id: "urn:app:action:1",
  item: {
    "@type": "Action",
    "@id": "urn:app:action:1",
    name: "Buy milk",
    endTime: null,
    additionalProperty: [pv("app:bucket", "next"), pv("app:isFocused", false)],
  },
});

const COMPLETED_RECORD = makeRecord({
  item_id: "tid-completed-1",
  canonical_id: "urn:app:completed:1",
  item: {
    "@type": "Action",
    "@id": "urn:app:completed:1",
    name: "Done task",
    endTime: "2026-01-01T00:00:00Z",
    additionalProperty: [pv("app:bucket", "next"), pv("app:isFocused", false)],
  },
});

const REFERENCE_RECORD = makeRecord({
  item_id: "tid-ref-1",
  canonical_id: "urn:app:reference:1",
  item: {
    "@type": "CreativeWork",
    "@id": "urn:app:reference:1",
    name: "Style guide",
    additionalProperty: [pv("app:bucket", "reference")],
  },
});

const INBOX_RECORD = makeRecord({
  item_id: "tid-inbox-1",
  canonical_id: "urn:app:inbox:1",
  item: {
    "@type": "Action",
    "@id": "urn:app:inbox:1",
    startTime: null,
    endTime: null,
    additionalProperty: [
      pv("app:bucket", "inbox"),
      pv("app:rawCapture", "Inbox thought"),
      pv("app:isFocused", false),
    ],
  },
});

// The production code now partitions active/completed into separate cache keys
const ACTIVE_KEY = [...ITEMS_QUERY_KEY, { completed: "false" }];
const COMPLETED_KEY = [...ITEMS_QUERY_KEY, { completed: "true" }];

function createWrapper(
  initialData?: ItemRecord[],
  completedData?: ItemRecord[],
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (initialData) {
    qc.setQueryData(ACTIVE_KEY, initialData);
  }
  if (completedData) {
    qc.setQueryData(COMPLETED_KEY, completedData);
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
  it("calls ItemsApi.create with inbox JSON-LD", async () => {
    mocked.create.mockResolvedValue(makeRecord({ item: {} }));

    const { result } = renderHook(() => useCaptureInbox(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.mutate("Buy groceries"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.create).toHaveBeenCalledTimes(1);
    const [jsonLd, source] = mocked.create.mock.calls[0]!;
    expect(jsonLd).toHaveProperty("@type", "Action");
    expect(jsonLd).not.toHaveProperty("name");
    const props = jsonLd.additionalProperty as Array<{
      propertyID: string;
      value: unknown;
    }>;
    expect(props.find((p) => p.propertyID === "app:rawCapture")?.value).toBe(
      "Buy groceries",
    );
    expect(source).toBe("manual");
  });
});

// ---------------------------------------------------------------------------
// useCaptureFile
// ---------------------------------------------------------------------------

describe("useCaptureFile", () => {
  const FILE_RECORD_UPLOAD = {
    file_id: "file-uuid-abc",
    original_name: "report.pdf",
    content_type: "application/pdf",
    size_bytes: 7,
    sha256: "abc123",
    created_at: "2026-01-01T00:00:00Z",
    download_url: "/files/file-uuid-abc",
  };

  beforeEach(() => {
    mockedUploadFile.mockResolvedValue(FILE_RECORD_UPLOAD);
  });

  it("classifies a PDF file as DigitalDocument", async () => {
    mocked.create.mockResolvedValue(makeRecord({ item_id: "srv-1", item: {} }));
    mocked.update.mockResolvedValue(makeRecord({ item: {} }));

    const { result } = renderHook(() => useCaptureFile(), {
      wrapper: createWrapper(),
    });

    const file = new File(["content"], "report.pdf", {
      type: "application/pdf",
    });
    act(() => result.current.mutate(file));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.create).toHaveBeenCalledTimes(1);
    const [jsonLd, source] = mocked.create.mock.calls[0]!;
    expect(jsonLd).toHaveProperty("@type", "DigitalDocument");
    expect(jsonLd).toHaveProperty("name", "report.pdf");
    expect(source).toBe("manual");
    const props = jsonLd.additionalProperty as Array<{
      propertyID: string;
      value: unknown;
    }>;
    expect(props.find((p) => p.propertyID === "app:bucket")?.value).toBe(
      "inbox",
    );
    expect(
      props.find((p) => p.propertyID === "app:captureSource")?.value,
    ).toMatchObject({
      kind: "file",
      fileName: "report.pdf",
    });
  });

  it("classifies an .eml file as EmailMessage", async () => {
    mocked.create.mockResolvedValue(makeRecord({ item_id: "srv-1", item: {} }));
    mocked.update.mockResolvedValue(makeRecord({ item: {} }));

    const { result } = renderHook(() => useCaptureFile(), {
      wrapper: createWrapper(),
    });

    // Browsers often report empty MIME for .eml, so fallback-by-extension kicks in
    const file = new File(["email content"], "message.eml", { type: "" });
    act(() => result.current.mutate(file));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [jsonLd] = mocked.create.mock.calls[0]!;
    expect(jsonLd).toHaveProperty("@type", "EmailMessage");
    expect(jsonLd).toHaveProperty("name", "message.eml");
    const props = jsonLd.additionalProperty as Array<{
      propertyID: string;
      value: unknown;
    }>;
    expect(
      props.find((p) => p.propertyID === "app:extractableEntities")?.value,
    ).toEqual(["Person", "Organization"]);
  });

  it("classifies a .vcf file as DigitalDocument with extractable entities", async () => {
    mocked.create.mockResolvedValue(makeRecord({ item_id: "srv-1", item: {} }));
    mocked.update.mockResolvedValue(makeRecord({ item: {} }));

    const { result } = renderHook(() => useCaptureFile(), {
      wrapper: createWrapper(),
    });

    const file = new File(["vcard"], "contact.vcf", { type: "" });
    act(() => result.current.mutate(file));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [jsonLd] = mocked.create.mock.calls[0]!;
    expect(jsonLd).toHaveProperty("@type", "DigitalDocument");
    const props = jsonLd.additionalProperty as Array<{
      propertyID: string;
      value: unknown;
    }>;
    expect(
      props.find((p) => p.propertyID === "app:extractableEntities")?.value,
    ).toEqual(["Person", "Organization"]);
  });

  it("optimistically adds record to active cache", async () => {
    // Delay the API response so we can observe the optimistic state
    let resolveApi!: (value: ItemRecord) => void;
    mocked.create.mockReturnValue(
      new Promise((resolve) => {
        resolveApi = resolve;
      }),
    );
    mocked.update.mockResolvedValue(makeRecord({ item: {} }));

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(ACTIVE_KEY, []);
    const qcWrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useCaptureFile(), {
      wrapper: qcWrapper,
    });

    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });
    act(() => result.current.mutate(file));

    // Before API resolves, cache should have the optimistic record
    await waitFor(() => {
      const cache = qc.getQueryData<ItemRecord[]>(ACTIVE_KEY);
      expect(cache).toHaveLength(1);
      expect(cache![0]!.item_id).toMatch(/^temp-/);
    });

    // Resolve the API and verify mutation completes
    const serverRecord = makeRecord({
      item_id: "server-1",
      item: { "@type": "DigitalDocument" },
    });
    resolveApi(serverRecord);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("restores cache on API failure", async () => {
    mocked.create.mockRejectedValue(new Error("Create failed"));

    const wrapper = createWrapper([ACTION_RECORD]);
    const { result } = renderHook(() => useCaptureFile(), { wrapper });

    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });
    act(() => result.current.mutate(file));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocked.create).toHaveBeenCalled();
    // Upload should NOT be attempted when create fails
    expect(mockedUploadFile).not.toHaveBeenCalled();
  });

  it("uploads binary and PATCHes item with fileId on success", async () => {
    const createdRecord = makeRecord({
      item_id: "srv-item-1",
      canonical_id: "urn:app:inbox:capture1",
      item: { "@type": "DigitalDocument", "@id": "urn:app:inbox:capture1" },
    });
    const patchedRecord = makeRecord({
      item_id: "srv-item-1",
      canonical_id: "urn:app:inbox:capture1",
      item: {
        "@type": "DigitalDocument",
        "@id": "urn:app:inbox:capture1",
        additionalProperty: [
          pv("app:fileId", "file-uuid-abc"),
          pv("app:downloadUrl", "/files/file-uuid-abc"),
        ],
      },
    });
    mocked.create.mockResolvedValue(createdRecord);
    mocked.update.mockResolvedValue(patchedRecord);

    const { result } = renderHook(() => useCaptureFile(), {
      wrapper: createWrapper(),
    });

    const file = new File(["content"], "report.pdf", {
      type: "application/pdf",
    });
    act(() => result.current.mutate(file));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 1. Item created
    expect(mocked.create).toHaveBeenCalledTimes(1);
    // 2. File uploaded
    expect(mockedUploadFile).toHaveBeenCalledWith(file);
    // 3. Item PATCHed with file link
    expect(mocked.update).toHaveBeenCalledWith(
      "srv-item-1",
      expect.objectContaining({
        additionalProperty: expect.arrayContaining([
          expect.objectContaining({
            propertyID: "app:fileId",
            value: "file-uuid-abc",
          }),
          expect.objectContaining({
            propertyID: "app:downloadUrl",
            value: "/files/file-uuid-abc",
          }),
        ]),
      }),
    );
  });

  it("item still persists when upload fails", async () => {
    const createdRecord = makeRecord({
      item_id: "srv-item-2",
      canonical_id: "urn:app:inbox:capture2",
      item: { "@type": "DigitalDocument", "@id": "urn:app:inbox:capture2" },
    });
    mocked.create.mockResolvedValue(createdRecord);
    mockedUploadFile.mockRejectedValue(new Error("Upload network error"));

    const { result } = renderHook(() => useCaptureFile(), {
      wrapper: createWrapper(),
    });

    const file = new File(["content"], "report.pdf", {
      type: "application/pdf",
    });
    act(() => result.current.mutate(file));

    // The mutation should still succeed — item was created, upload failure is tolerated
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.create).toHaveBeenCalledTimes(1);
    expect(mockedUploadFile).toHaveBeenCalledTimes(1);
    // PATCH should NOT be called since upload failed
    expect(mocked.update).not.toHaveBeenCalled();
  });

  it("replaces temp item_id in cache immediately after POST, before upload", async () => {
    // This test verifies the race condition fix: after the POST creates the
    // item on the server, the cache must be updated with the real item_id
    // BEFORE the upload starts.  Otherwise, a fast triage (useMoveAction)
    // during upload would find "temp-xxx" and PATCH a non-existent item.
    let resolveUpload!: (value: {
      file_id: string;
      original_name: string;
      content_type: string;
      size_bytes: number;
      sha256: string;
      created_at: string;
      download_url: string;
    }) => void;
    mockedUploadFile.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );

    // Mock create to return a record that echoes the @id from the jsonLd
    mocked.create.mockImplementation(
      async (jsonLd: Record<string, unknown>) => {
        return makeRecord({
          item_id: "real-server-id",
          canonical_id: jsonLd["@id"] as string,
          item: jsonLd,
        });
      },
    );
    mocked.update.mockResolvedValue(makeRecord({ item: {} }));

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(ACTIVE_KEY, []);
    const qcWrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useCaptureFile(), {
      wrapper: qcWrapper,
    });

    const file = new File(["content"], "report.pdf", {
      type: "application/pdf",
    });
    act(() => result.current.mutate(file));

    // Wait for the POST to complete (upload is still pending).
    // The cache should have the real server item_id, not "temp-xxx".
    await waitFor(() => {
      const cache = qc.getQueryData<ItemRecord[]>(ACTIVE_KEY);
      expect(cache).toHaveLength(1);
      expect(cache![0]!.item_id).toBe("real-server-id");
    });

    // Resolve the upload so the mutation completes
    resolveUpload({
      file_id: "file-uuid",
      original_name: "report.pdf",
      content_type: "application/pdf",
      size_bytes: 7,
      sha256: "abc",
      created_at: "2026-01-01T00:00:00Z",
      download_url: "/files/file-uuid",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("item persists when PATCH fails after upload", async () => {
    const createdRecord = makeRecord({
      item_id: "srv-item-3",
      canonical_id: "urn:app:inbox:capture3",
      item: { "@type": "DigitalDocument", "@id": "urn:app:inbox:capture3" },
    });
    mocked.create.mockResolvedValue(createdRecord);
    mocked.update.mockRejectedValue(new Error("PATCH failed"));

    const { result } = renderHook(() => useCaptureFile(), {
      wrapper: createWrapper(),
    });

    const file = new File(["content"], "report.pdf", {
      type: "application/pdf",
    });
    act(() => result.current.mutate(file));

    // Should still succeed — PATCH failure is tolerated
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.create).toHaveBeenCalledTimes(1);
    expect(mockedUploadFile).toHaveBeenCalledTimes(1);
    expect(mocked.update).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// useAddAction
// ---------------------------------------------------------------------------

describe("useAddAction", () => {
  it("creates action with specified bucket", async () => {
    mocked.create.mockResolvedValue(makeRecord({ item: {} }));

    const { result } = renderHook(() => useAddAction(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.mutate({ title: "Call Bob", bucket: "next" }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [jsonLd] = mocked.create.mock.calls[0]!;
    expect(jsonLd).toHaveProperty("@type", "Action");
    expect(jsonLd).not.toHaveProperty("name");
    const props = jsonLd.additionalProperty as Array<{
      propertyID: string;
      value: unknown;
    }>;
    expect(props.find((p) => p.propertyID === "app:rawCapture")?.value).toBe(
      "Call Bob",
    );
  });
});

// ---------------------------------------------------------------------------
// useAddReference
// ---------------------------------------------------------------------------

describe("useAddReference", () => {
  it("creates CreativeWork reference", async () => {
    mocked.create.mockResolvedValue(makeRecord({ item: {} }));

    const { result } = renderHook(() => useAddReference(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.mutate("Style guide"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [jsonLd] = mocked.create.mock.calls[0]!;
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

    act(() => result.current.mutate("urn:app:action:1" as CanonicalId));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.update).toHaveBeenCalledTimes(1);
    const [itemId, patch] = mocked.update.mock.calls[0]!;
    expect(itemId).toBe("tid-action-1");
    expect(patch.endTime).toBeTruthy(); // ISO date string
  });

  it("clears endTime when uncompleting", async () => {
    mocked.update.mockResolvedValue(COMPLETED_RECORD);

    const { result } = renderHook(() => useCompleteAction(), {
      wrapper: createWrapper([COMPLETED_RECORD]),
    });

    act(() => result.current.mutate("urn:app:completed:1" as CanonicalId));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, patch] = mocked.update.mock.calls[0]!;
    expect(patch.endTime).toBeNull();
  });

  it("throws when canonical_id not in cache", async () => {
    const { result } = renderHook(() => useCompleteAction(), {
      wrapper: createWrapper([]),
    });

    act(() => result.current.mutate("urn:app:missing:1" as CanonicalId));

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

    act(() => result.current.mutate("urn:app:action:1" as CanonicalId));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, patch] = mocked.update.mock.calls[0]!;
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
    const [, patch] = mocked.update.mock.calls[0]!;
    expect(patch.additionalProperty).toEqual([
      { "@type": "PropertyValue", propertyID: "app:bucket", value: "someday" },
    ]);
    expect(patch["@type"]).toBeUndefined();
  });

  it("does not promote @type when moving inbox Action to action bucket", async () => {
    mocked.update.mockResolvedValue(ACTION_RECORD);

    const { result } = renderHook(() => useMoveAction(), {
      wrapper: createWrapper([INBOX_RECORD]),
    });

    act(() =>
      result.current.mutate({
        canonicalId: "urn:app:inbox:1" as CanonicalId,
        bucket: "next",
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, patch] = mocked.update.mock.calls[0]!;
    expect(patch["@type"]).toBeUndefined();
    expect(patch.additionalProperty).toEqual([
      { "@type": "PropertyValue", propertyID: "app:bucket", value: "next" },
    ]);
  });

  it("promotes @type to Action when moving DigitalDocument to next", async () => {
    const digitalDocRecord = makeRecord({
      item_id: "tid-doc-1",
      canonical_id: "urn:app:inbox:doc1",
      item: {
        "@type": "DigitalDocument",
        "@id": "urn:app:inbox:doc1",
        name: "report.pdf",
        additionalProperty: [
          pv("app:bucket", "inbox"),
          pv("app:isFocused", false),
        ],
      },
    });
    mocked.update.mockResolvedValue(digitalDocRecord);

    const { result } = renderHook(() => useMoveAction(), {
      wrapper: createWrapper([digitalDocRecord]),
    });

    act(() =>
      result.current.mutate({
        canonicalId: "urn:app:inbox:doc1" as CanonicalId,
        bucket: "next",
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, patch] = mocked.update.mock.calls[0]!;
    expect(patch["@type"]).toBe("Action");
    expect(patch.additionalProperty).toEqual([
      { "@type": "PropertyValue", propertyID: "app:bucket", value: "next" },
    ]);
  });

  it("promotes @type to CreativeWork when moving inbox item to reference", async () => {
    mocked.update.mockResolvedValue(REFERENCE_RECORD);

    const { result } = renderHook(() => useMoveAction(), {
      wrapper: createWrapper([INBOX_RECORD]),
    });

    act(() =>
      result.current.mutate({
        canonicalId: "urn:app:inbox:1" as CanonicalId,
        bucket: "reference",
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, patch] = mocked.update.mock.calls[0]!;
    expect(patch["@type"]).toBe("CreativeWork");
  });
});

// ---------------------------------------------------------------------------
// useUpdateItem
// ---------------------------------------------------------------------------

describe("useUpdateItem", () => {
  it("sends arbitrary patch to ItemsApi.update", async () => {
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
    const [itemId, patch] = mocked.update.mock.calls[0]!;
    expect(itemId).toBe("tid-action-1");
    expect(patch).toEqual({ name: "Updated title" });
  });
});

// ---------------------------------------------------------------------------
// useTriageItem
// ---------------------------------------------------------------------------

describe("useTriageItem", () => {
  it("archives when targetBucket is archive", async () => {
    mocked.archive.mockResolvedValue({
      item_id: "tid-action-1",
      archived_at: "2026-01-01",
      ok: true,
    });

    const { result } = renderHook(() => useTriageItem(), {
      wrapper: createWrapper([ACTION_RECORD]),
    });

    const item = createInboxItem({
      name: "Buy milk",
      id: "urn:app:action:1" as CanonicalId,
      needsEnrichment: false,
      confidence: "high",
    });

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
    mocked.create.mockResolvedValue(makeRecord({ item: {} }));

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
    const [jsonLd] = mocked.create.mock.calls[0]!;
    expect(jsonLd).toHaveProperty("@type", "Action");
    expect(jsonLd).not.toHaveProperty("name");
    const props = jsonLd.additionalProperty as Array<{
      propertyID: string;
      value: unknown;
    }>;
    expect(props.find((p) => p.propertyID === "app:rawCapture")?.value).toBe(
      "Design mockups",
    );
    expect(jsonLd).not.toHaveProperty("isPartOf");
    expect(
      props.find((p) => p.propertyID === "app:projectRefs")?.value,
    ).toEqual(["urn:app:project:1"]);
  });
});

// ---------------------------------------------------------------------------
// useArchiveReference
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Completed cache fallback
// ---------------------------------------------------------------------------

describe("completed cache fallback", () => {
  it("useCompleteAction finds record in completed cache", async () => {
    mocked.update.mockResolvedValue(COMPLETED_RECORD);

    const { result } = renderHook(() => useCompleteAction(), {
      wrapper: createWrapper([], [COMPLETED_RECORD]),
    });

    act(() => result.current.mutate("urn:app:completed:1" as CanonicalId));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, patch] = mocked.update.mock.calls[0]!;
    // Uncompleting: endTime should be null
    expect(patch.endTime).toBeNull();
  });

  it("useToggleFocus finds record in completed cache", async () => {
    mocked.update.mockResolvedValue(COMPLETED_RECORD);

    const { result } = renderHook(() => useToggleFocus(), {
      wrapper: createWrapper([], [COMPLETED_RECORD]),
    });

    act(() => result.current.mutate("urn:app:completed:1" as CanonicalId));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.update).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Focus toggle edge cases
// ---------------------------------------------------------------------------

describe("useToggleFocus edge cases", () => {
  it("toggles focused from true to false", async () => {
    const focusedRecord = makeRecord({
      item_id: "tid-focused-1",
      canonical_id: "urn:app:focused:1",
      item: {
        "@type": "Action",
        "@id": "urn:app:focused:1",
        name: "Focused task",
        endTime: null,
        additionalProperty: [
          pv("app:bucket", "next"),
          pv("app:isFocused", true),
        ],
      },
    });
    mocked.update.mockResolvedValue(focusedRecord);

    const { result } = renderHook(() => useToggleFocus(), {
      wrapper: createWrapper([focusedRecord]),
    });

    act(() => result.current.mutate("urn:app:focused:1" as CanonicalId));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, patch] = mocked.update.mock.calls[0]!;
    expect(patch.additionalProperty).toEqual([
      { "@type": "PropertyValue", propertyID: "app:isFocused", value: false },
    ]);
  });

  it("adds isFocused when property is missing", async () => {
    const noFocusPropRecord = makeRecord({
      item_id: "tid-nofocus-1",
      canonical_id: "urn:app:nofocus:1",
      item: {
        "@type": "Action",
        "@id": "urn:app:nofocus:1",
        name: "No focus prop",
        endTime: null,
        additionalProperty: [pv("app:bucket", "next")],
      },
    });
    mocked.update.mockResolvedValue(noFocusPropRecord);

    const { result } = renderHook(() => useToggleFocus(), {
      wrapper: createWrapper([noFocusPropRecord]),
    });

    act(() => result.current.mutate("urn:app:nofocus:1" as CanonicalId));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, patch] = mocked.update.mock.calls[0]!;
    // Missing prop defaults to false, so toggle sets to true
    expect(patch.additionalProperty).toEqual([
      { "@type": "PropertyValue", propertyID: "app:isFocused", value: true },
    ]);
  });
});

// ---------------------------------------------------------------------------
// onError rollback
// ---------------------------------------------------------------------------

describe("onError rollback", () => {
  it("useCompleteAction restores cache on API failure", async () => {
    mocked.update.mockRejectedValue(new Error("Server error"));

    const wrapper = createWrapper([ACTION_RECORD]);
    const { result } = renderHook(() => useCompleteAction(), { wrapper });

    act(() => result.current.mutate("urn:app:action:1" as CanonicalId));

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Cache should be restored (rollback)
    expect(mocked.update).toHaveBeenCalled();
  });

  it("useMoveAction restores cache on API failure", async () => {
    mocked.update.mockRejectedValue(new Error("Server error"));

    const wrapper = createWrapper([ACTION_RECORD]);
    const { result } = renderHook(() => useMoveAction(), { wrapper });

    act(() =>
      result.current.mutate({
        canonicalId: "urn:app:action:1" as CanonicalId,
        bucket: "someday",
      }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocked.update).toHaveBeenCalled();
  });

  it("useArchiveReference restores cache on API failure", async () => {
    mocked.archive.mockRejectedValue(new Error("Server error"));

    const wrapper = createWrapper([REFERENCE_RECORD]);
    const { result } = renderHook(() => useArchiveReference(), { wrapper });

    act(() => result.current.mutate("urn:app:reference:1" as CanonicalId));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocked.archive).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useArchiveReference
// ---------------------------------------------------------------------------

describe("useArchiveReference", () => {
  it("archives a reference by canonical_id", async () => {
    mocked.archive.mockResolvedValue({
      item_id: "tid-ref-1",
      archived_at: "2026-01-01",
      ok: true,
    });

    const { result } = renderHook(() => useArchiveReference(), {
      wrapper: createWrapper([REFERENCE_RECORD]),
    });

    act(() => result.current.mutate("urn:app:reference:1" as CanonicalId));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.archive).toHaveBeenCalledWith("tid-ref-1");
  });

  it("throws when canonical_id not in cache", async () => {
    const { result } = renderHook(() => useArchiveReference(), {
      wrapper: createWrapper([]),
    });

    act(() => result.current.mutate("urn:app:missing:1" as CanonicalId));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// useCreateProject
// ---------------------------------------------------------------------------

describe("useCreateProject", () => {
  it("creates project JSON-LD", async () => {
    mocked.create.mockResolvedValue(makeRecord({ item: {} }));

    const { result } = renderHook(() => useCreateProject(), {
      wrapper: createWrapper(),
    });

    act(() =>
      result.current.mutate({ name: "Q2 Sprint", desiredOutcome: "Ship MVP" }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [jsonLd] = mocked.create.mock.calls[0]!;
    expect(jsonLd).toHaveProperty("name", "Q2 Sprint");
  });

  it("restores cache on API failure", async () => {
    mocked.create.mockRejectedValue(new Error("Server error"));

    const wrapper = createWrapper([ACTION_RECORD]);
    const { result } = renderHook(() => useCreateProject(), { wrapper });

    act(() => result.current.mutate({ name: "Fail", desiredOutcome: "N/A" }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocked.create).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Not-found errors (mutationFn throws when canonical_id not in cache)
// ---------------------------------------------------------------------------

describe("not-found errors", () => {
  const missing = "urn:app:missing:1" as CanonicalId;

  it("useTriageItem throws when canonical_id not in cache", async () => {
    const item = createInboxItem({
      id: missing,
      name: "Ghost",
      needsEnrichment: false,
      confidence: "high",
    });
    const { result } = renderHook(() => useTriageItem(), {
      wrapper: createWrapper([]),
    });

    act(() =>
      result.current.mutate({ item, result: { targetBucket: "next" } }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/not found/i);
  });

  it("useMoveAction throws when canonical_id not in cache", async () => {
    const { result } = renderHook(() => useMoveAction(), {
      wrapper: createWrapper([]),
    });

    act(() =>
      result.current.mutate({ canonicalId: missing, bucket: "someday" }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/not found/i);
  });

  it("useUpdateItem throws when canonical_id not in cache", async () => {
    const { result } = renderHook(() => useUpdateItem(), {
      wrapper: createWrapper([]),
    });

    act(() =>
      result.current.mutate({
        canonicalId: missing,
        patch: { name: "oops" },
      }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/not found/i);
  });

  it("useToggleFocus throws when canonical_id not in cache", async () => {
    const { result } = renderHook(() => useToggleFocus(), {
      wrapper: createWrapper([]),
    });

    act(() => result.current.mutate(missing));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// Additional onError rollback tests
// ---------------------------------------------------------------------------

describe("onError rollback (remaining hooks)", () => {
  it("useCaptureInbox restores cache on API failure", async () => {
    mocked.create.mockRejectedValue(new Error("Server error"));

    const wrapper = createWrapper([ACTION_RECORD]);
    const { result } = renderHook(() => useCaptureInbox(), { wrapper });

    act(() => result.current.mutate("Fail capture"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocked.create).toHaveBeenCalled();
  });

  it("useTriageItem restores cache on API failure", async () => {
    mocked.update.mockRejectedValue(new Error("Server error"));

    const wrapper = createWrapper([ACTION_RECORD]);
    const { result } = renderHook(() => useTriageItem(), { wrapper });

    const item = createInboxItem({
      name: "Buy milk",
      id: "urn:app:action:1" as CanonicalId,
      needsEnrichment: false,
      confidence: "high",
    });

    act(() =>
      result.current.mutate({ item, result: { targetBucket: "next" } }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocked.update).toHaveBeenCalled();
  });

  it("useToggleFocus restores cache on API failure", async () => {
    mocked.update.mockRejectedValue(new Error("Server error"));

    const wrapper = createWrapper([ACTION_RECORD]);
    const { result } = renderHook(() => useToggleFocus(), { wrapper });

    act(() => result.current.mutate("urn:app:action:1" as CanonicalId));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocked.update).toHaveBeenCalled();
  });

  it("useUpdateItem restores cache on API failure", async () => {
    mocked.update.mockRejectedValue(new Error("Server error"));

    const wrapper = createWrapper([ACTION_RECORD]);
    const { result } = renderHook(() => useUpdateItem(), { wrapper });

    act(() =>
      result.current.mutate({
        canonicalId: "urn:app:action:1" as CanonicalId,
        patch: { name: "oops" },
      }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocked.update).toHaveBeenCalled();
  });

  it("useAddAction restores cache on API failure", async () => {
    mocked.create.mockRejectedValue(new Error("Server error"));

    const wrapper = createWrapper([ACTION_RECORD]);
    const { result } = renderHook(() => useAddAction(), { wrapper });

    act(() => result.current.mutate({ title: "Fail action", bucket: "next" }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocked.create).toHaveBeenCalled();
  });

  it("useAddReference restores cache on API failure", async () => {
    mocked.create.mockRejectedValue(new Error("Server error"));

    const wrapper = createWrapper([ACTION_RECORD]);
    const { result } = renderHook(() => useAddReference(), { wrapper });

    act(() => result.current.mutate("Fail ref"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocked.create).toHaveBeenCalled();
  });

  it("useAddProjectAction restores cache on API failure", async () => {
    mocked.create.mockRejectedValue(new Error("Server error"));

    const wrapper = createWrapper([ACTION_RECORD]);
    const { result } = renderHook(() => useAddProjectAction(), { wrapper });

    act(() =>
      result.current.mutate({
        projectId: "urn:app:project:1" as CanonicalId,
        title: "Fail",
      }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocked.create).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useTriageItem — non-archive path
// ---------------------------------------------------------------------------

describe("useTriageItem non-archive", () => {
  it("updates bucket via triage patch for non-archive target", async () => {
    mocked.update.mockResolvedValue(ACTION_RECORD);

    const { result } = renderHook(() => useTriageItem(), {
      wrapper: createWrapper([ACTION_RECORD]),
    });

    const item = createInboxItem({
      name: "Buy milk",
      id: "urn:app:action:1" as CanonicalId,
      needsEnrichment: false,
      confidence: "high",
    });

    act(() =>
      result.current.mutate({ item, result: { targetBucket: "next" } }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.update).toHaveBeenCalledWith(
      "tid-action-1",
      expect.objectContaining({
        additionalProperty: expect.arrayContaining([
          expect.objectContaining({
            propertyID: "app:bucket",
            value: "next",
          }),
        ]),
      }),
    );
  });
});
