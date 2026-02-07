import { describe, it, expect, beforeEach } from "vitest";
import {
  toJsonLd,
  fromJsonLd,
  buildTriagePatch,
  buildItemEditPatch,
  buildNewInboxJsonLd,
} from "./thing-serializer";
import {
  createInboxItem,
  createAction,
  createProject,
  createReferenceMaterial,
  resetFactoryCounter,
} from "@/model/factories";
import type { ThingRecord } from "./api-client";
import type { Thing, Project, ReferenceMaterial } from "@/model/gtd-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapAsThingRecord(
  thing: Record<string, unknown>,
  overrides?: Partial<ThingRecord>,
): ThingRecord {
  return {
    thing_id: overrides?.thing_id ?? "uuid-1",
    canonical_id: overrides?.canonical_id ?? (thing["@id"] as string),
    source: overrides?.source ?? "manual",
    thing,
    created_at: overrides?.created_at ?? "2025-01-01T00:00:00Z",
    updated_at: overrides?.updated_at ?? "2025-01-01T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// toJsonLd
// ---------------------------------------------------------------------------

describe("toJsonLd", () => {
  beforeEach(() => resetFactoryCounter());

  it("serializes an InboxItem with correct @type and fields", () => {
    const item = createInboxItem({ title: "Buy milk" });
    const ld = toJsonLd(item);

    expect(ld["@type"]).toBe("gtd:InboxItem");
    expect(ld["@id"]).toBe(item.id);
    expect(ld._schemaVersion).toBe(1);
    expect(ld.title).toBe("Buy milk");
    expect(ld.bucket).toBe("inbox");
    expect(ld.rawCapture).toBe("Buy milk");
    expect(ld.needsEnrichment).toBe(true);
    expect(ld.confidence).toBe("low");
  });

  it("serializes an Action with all Action-specific fields", () => {
    const action = createAction({
      title: "Call dentist",
      bucket: "next",
      isFocused: true,
      dueDate: "2025-06-01",
    });
    const ld = toJsonLd(action);

    expect(ld["@type"]).toBe("gtd:Action");
    expect(ld.bucket).toBe("next");
    expect(ld.isFocused).toBe(true);
    expect(ld.dueDate).toBe("2025-06-01");
    expect(ld.contexts).toEqual([]);
  });

  it("serializes a Project", () => {
    const project = createProject({
      title: "Renovate kitchen",
      desiredOutcome: "Modern kitchen",
    });
    const ld = toJsonLd(project);

    expect(ld["@type"]).toBe("gtd:Project");
    expect(ld.bucket).toBe("project");
    expect(ld.desiredOutcome).toBe("Modern kitchen");
    expect(ld.status).toBe("active");
  });

  it("serializes a ReferenceMaterial", () => {
    const ref = createReferenceMaterial({
      title: "Tax docs 2024",
      externalUrl: "https://example.com/docs",
    });
    const ld = toJsonLd(ref);

    expect(ld["@type"]).toBe("gtd:Reference");
    expect(ld.bucket).toBe("reference");
    expect(ld.externalUrl).toBe("https://example.com/docs");
  });
});

// ---------------------------------------------------------------------------
// fromJsonLd
// ---------------------------------------------------------------------------

describe("fromJsonLd", () => {
  it("deserializes a gtd:InboxItem ThingRecord", () => {
    const record = wrapAsThingRecord({
      "@id": "urn:gtd:inbox:abc-123",
      "@type": "gtd:InboxItem",
      title: "Buy milk",
      bucket: "inbox",
      rawCapture: "Buy milk",
      tags: [],
      references: [],
      captureSource: { kind: "thought" },
      provenance: {
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        history: [],
      },
      ports: [],
      needsEnrichment: true,
      confidence: "low",
    });

    const item = fromJsonLd(record) as Thing;
    expect(item.bucket).toBe("inbox");
    expect(item.id).toBe("urn:gtd:inbox:abc-123");
    expect(item.title).toBe("Buy milk");
    expect(item.rawCapture).toBe("Buy milk");
  });

  it("deserializes a gtd:Action ThingRecord", () => {
    const record = wrapAsThingRecord({
      "@id": "urn:gtd:action:def-456",
      "@type": "gtd:Action",
      title: "Call dentist",
      bucket: "next",
      contexts: [],
      isFocused: true,
      dueDate: "2025-06-01",
      tags: [],
      references: [],
      captureSource: { kind: "thought" },
      provenance: {
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        history: [],
      },
      ports: [],
      needsEnrichment: false,
      confidence: "high",
    });

    const action = fromJsonLd(record) as Thing;
    expect(action.bucket).toBe("next");
    expect(action.isFocused).toBe(true);
    expect(action.dueDate).toBe("2025-06-01");
  });

  it("deserializes a gtd:Project ThingRecord", () => {
    const record = wrapAsThingRecord({
      "@id": "urn:gtd:project:ghi-789",
      "@type": "gtd:Project",
      title: "Renovate kitchen",
      bucket: "project",
      desiredOutcome: "Modern kitchen",
      status: "active",
      actionIds: [],
      isFocused: false,
      tags: [],
      references: [],
      captureSource: { kind: "thought" },
      provenance: {
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        history: [],
      },
      ports: [],
      needsEnrichment: false,
      confidence: "high",
    });

    const project = fromJsonLd(record) as Project;
    expect(project.bucket).toBe("project");
    expect(project.desiredOutcome).toBe("Modern kitchen");
  });

  it("deserializes a gtd:Reference ThingRecord", () => {
    const record = wrapAsThingRecord({
      "@id": "urn:gtd:reference:jkl-012",
      "@type": "gtd:Reference",
      title: "Tax docs",
      bucket: "reference",
      externalUrl: "https://example.com",
      tags: [],
      references: [],
      captureSource: { kind: "thought" },
      provenance: {
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        history: [],
      },
      ports: [],
      needsEnrichment: false,
      confidence: "medium",
    });

    const ref = fromJsonLd(record) as ReferenceMaterial;
    expect(ref.bucket).toBe("reference");
    expect(ref.externalUrl).toBe("https://example.com");
  });

  it("round-trips: toJsonLd → wrapAsThingRecord → fromJsonLd preserves data", () => {
    resetFactoryCounter();
    const original = createAction({
      title: "Write tests",
      bucket: "next",
      isFocused: true,
      dueDate: "2025-12-31",
    });

    const ld = toJsonLd(original);
    const record = wrapAsThingRecord(ld);
    const restored = fromJsonLd(record) as Thing;

    expect(restored.id).toBe(original.id);
    expect(restored.title).toBe(original.title);
    expect(restored.bucket).toBe(original.bucket);
    expect(restored.isFocused).toBe(original.isFocused);
    expect(restored.dueDate).toBe(original.dueDate);
  });

  it("falls back to inbox for unknown @type", () => {
    const record = wrapAsThingRecord({
      "@id": "urn:gtd:inbox:unknown-1",
      "@type": "gtd:SomeFutureType",
      title: "Unknown thing",
      tags: [],
      references: [],
      ports: [],
    });

    const item = fromJsonLd(record);
    expect(item.bucket).toBe("inbox");
  });
});

// ---------------------------------------------------------------------------
// buildTriagePatch
// ---------------------------------------------------------------------------

describe("buildTriagePatch", () => {
  beforeEach(() => resetFactoryCounter());

  it("produces an Action PATCH when triaging to 'next'", () => {
    const item = createInboxItem({ title: "Buy milk" });
    const patch = buildTriagePatch(item, { targetBucket: "next" });

    expect(patch["@type"]).toBe("gtd:Action");
    expect(patch.bucket).toBe("next");
  });

  it("includes projectId when provided", () => {
    const item = createInboxItem({ title: "Task" });
    const patch = buildTriagePatch(item, {
      targetBucket: "next",
      projectId: "urn:gtd:project:p-1" as any,
    });

    expect(patch.projectId).toBe("urn:gtd:project:p-1");
  });

  it("includes scheduledDate when date is provided", () => {
    const item = createInboxItem({ title: "Task" });
    const patch = buildTriagePatch(item, {
      targetBucket: "calendar",
      date: "2025-06-15",
    });

    expect(patch.scheduledDate).toBe("2025-06-15");
  });

  it("produces a Reference PATCH when triaging to 'reference'", () => {
    const item = createInboxItem({ title: "Docs" });
    const patch = buildTriagePatch(item, { targetBucket: "reference" });

    expect(patch["@type"]).toBe("gtd:Reference");
    expect(patch.bucket).toBe("reference");
  });

  it("includes all required Action fields with defaults", () => {
    const item = createInboxItem({ title: "Task" });
    const patch = buildTriagePatch(item, { targetBucket: "next" });

    expect(patch.contexts).toEqual([]);
    expect(patch.isFocused).toBe(false);
    expect(patch.completedAt).toBeNull();
    expect(patch.delegatedTo).toBeNull();
    expect(patch.scheduledDate).toBeNull();
    expect(patch.scheduledTime).toBeNull();
    expect(patch.dueDate).toBeNull();
    expect(patch.startDate).toBeNull();
    expect(patch.sequenceOrder).toBeNull();
    expect(patch.recurrence).toBeNull();
  });

  it("includes all required Reference fields with defaults", () => {
    const item = createInboxItem({ title: "Docs" });
    const patch = buildTriagePatch(item, { targetBucket: "reference" });

    expect(patch["@type"]).toBe("gtd:Reference");
    expect(patch.bucket).toBe("reference");
    expect(patch.contentType).toBeNull();
    expect(patch.externalUrl).toBeNull();
  });

  it("includes energy level as computation port", () => {
    const item = createInboxItem({ title: "Task" });
    const patch = buildTriagePatch(item, {
      targetBucket: "next",
      energyLevel: "high",
    });

    expect(patch.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "computation", energyLevel: "high" }),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// buildItemEditPatch
// ---------------------------------------------------------------------------

describe("buildItemEditPatch", () => {
  it("maps dueDate to patch", () => {
    const patch = buildItemEditPatch({ dueDate: "2026-06-01" });
    expect(patch.dueDate).toBe("2026-06-01");
  });

  it("maps scheduledDate to patch", () => {
    const patch = buildItemEditPatch({ scheduledDate: "2026-06-15" });
    expect(patch.scheduledDate).toBe("2026-06-15");
  });

  it("maps contexts to patch", () => {
    const patch = buildItemEditPatch({ contexts: ["@phone", "@office"] });
    expect(patch.contexts).toEqual(["@phone", "@office"]);
  });

  it("maps projectId to patch", () => {
    const patch = buildItemEditPatch({
      projectId: "urn:gtd:project:p-1" as any,
    });
    expect(patch.projectId).toBe("urn:gtd:project:p-1");
  });

  it("maps energyLevel to computation port", () => {
    const patch = buildItemEditPatch({ energyLevel: "high" });
    expect(patch.ports).toEqual([{ kind: "computation", energyLevel: "high" }]);
  });

  it("nulls dueDate when empty string", () => {
    const patch = buildItemEditPatch({ dueDate: "" });
    expect(patch.dueDate).toBeNull();
  });

  it("only includes provided fields", () => {
    const patch = buildItemEditPatch({ contexts: ["@home"] });
    expect(patch).toEqual({ contexts: ["@home"] });
    expect(patch).not.toHaveProperty("dueDate");
    expect(patch).not.toHaveProperty("ports");
  });
});

// ---------------------------------------------------------------------------
// buildNewInboxJsonLd
// ---------------------------------------------------------------------------

describe("buildNewInboxJsonLd", () => {
  it("creates a valid inbox JSON-LD object from raw text", () => {
    const ld = buildNewInboxJsonLd("Call the plumber");

    expect(ld["@type"]).toBe("gtd:InboxItem");
    expect(ld._schemaVersion).toBe(1);
    expect(ld.title).toBe("Call the plumber");
    expect(ld.rawCapture).toBe("Call the plumber");
    expect(ld.bucket).toBe("inbox");
    expect(ld.needsEnrichment).toBe(true);
    expect(ld.confidence).toBe("low");
    expect(typeof ld["@id"]).toBe("string");
    expect((ld["@id"] as string).startsWith("urn:gtd:inbox:")).toBe(true);
  });

  it("generates unique IDs for different calls", () => {
    const ld1 = buildNewInboxJsonLd("First");
    const ld2 = buildNewInboxJsonLd("Second");

    expect(ld1["@id"]).not.toBe(ld2["@id"]);
  });
});
