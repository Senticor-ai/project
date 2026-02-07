import { describe, it, expect, beforeEach } from "vitest";
import {
  toJsonLd,
  fromJsonLd,
  buildTriagePatch,
  buildItemEditPatch,
  buildNewInboxJsonLd,
  buildNewActionJsonLd,
  buildNewReferenceJsonLd,
} from "./thing-serializer";
import {
  createInboxItem,
  createAction,
  createProject,
  createReferenceMaterial,
  resetFactoryCounter,
} from "@/model/factories";
import type { ThingRecord } from "./api-client";
import type { Thing, Project, ReferenceMaterial } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";
import {
  validateInboxThing,
  validateActionThing,
  validateProjectThing,
  validateReferenceThing,
  validateThingPatch,
  formatErrors,
} from "./__tests__/schema-validator";

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

/** Extract a PropertyValue's value from an additionalProperty array. */
function getProp(
  ld: Record<string, unknown>,
  propertyID: string,
): unknown {
  const props = ld.additionalProperty as Array<{
    "@type": string;
    propertyID: string;
    value: unknown;
  }>;
  const pv = props?.find((p) => p.propertyID === propertyID);
  return pv?.value;
}

/** Assert a PropertyValue exists with correct @type. */
function expectPropertyValue(
  ld: Record<string, unknown>,
  propertyID: string,
  expectedValue: unknown,
) {
  const props = ld.additionalProperty as Array<{
    "@type": string;
    propertyID: string;
    value: unknown;
  }>;
  expect(props).toBeDefined();
  const pv = props.find((p) => p.propertyID === propertyID);
  expect(pv).toBeDefined();
  expect(pv!["@type"]).toBe("PropertyValue");
  expect(pv!.value).toEqual(expectedValue);
}

// ---------------------------------------------------------------------------
// toJsonLd — v2 schema.org format
// ---------------------------------------------------------------------------

describe("toJsonLd", () => {
  beforeEach(() => resetFactoryCounter());

  describe("InboxItem → schema:Thing", () => {
    it("uses @type Thing and _schemaVersion 2", () => {
      const item = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(item);

      expect(ld["@type"]).toBe("Thing");
      expect(ld._schemaVersion).toBe(2);
    });

    it("maps name to schema.org name property", () => {
      const item = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(item);

      expect(ld.name).toBe("Buy milk");
      expect(ld).not.toHaveProperty("title");
    });

    it("maps description to schema.org description property", () => {
      const item = createInboxItem({
        name: "Task",
        description: "Some details",
      });
      const ld = toJsonLd(item);

      expect(ld.description).toBe("Some details");
      expect(ld).not.toHaveProperty("notes");
    });

    it("maps tags to schema.org keywords", () => {
      const item = createInboxItem({ name: "Task", tags: ["urgent", "work"] });
      const ld = toJsonLd(item);

      expect(ld.keywords).toEqual(["urgent", "work"]);
      expect(ld).not.toHaveProperty("tags");
    });

    it("maps provenance dates to dateCreated/dateModified", () => {
      const item = createInboxItem({ name: "Task" });
      const ld = toJsonLd(item);

      expect(ld.dateCreated).toBe(item.provenance.createdAt);
      expect(ld.dateModified).toBe(item.provenance.updatedAt);
    });

    it("stores bucket as additionalProperty with app: prefix", () => {
      const item = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(item);

      expectPropertyValue(ld, "app:bucket", "inbox");
    });

    it("stores rawCapture as additionalProperty", () => {
      const item = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(item);

      expectPropertyValue(ld, "app:rawCapture", "Buy milk");
    });

    it("stores needsEnrichment as additionalProperty", () => {
      const item = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(item);

      expectPropertyValue(ld, "app:needsEnrichment", true);
    });

    it("stores confidence as additionalProperty", () => {
      const item = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(item);

      expectPropertyValue(ld, "app:confidence", "low");
    });

    it("stores captureSource as additionalProperty", () => {
      const item = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(item);

      expectPropertyValue(ld, "app:captureSource", { kind: "thought" });
    });

    it("stores contexts as additionalProperty", () => {
      const item = createInboxItem({ name: "Task" });
      const ld = toJsonLd(item);

      expectPropertyValue(ld, "app:contexts", []);
    });

    it("preserves @id", () => {
      const item = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(item);

      expect(ld["@id"]).toBe(item.id);
      expect((ld["@id"] as string).startsWith("urn:app:inbox:")).toBe(true);
    });

    it("stores ports as additionalProperty", () => {
      const item = createInboxItem({ name: "Task" });
      const ld = toJsonLd(item);

      expectPropertyValue(ld, "app:ports", []);
    });

    it("stores typed references as additionalProperty", () => {
      const item = createInboxItem({ name: "Task" });
      const ld = toJsonLd(item);

      expectPropertyValue(ld, "app:typedReferences", []);
    });

    it("stores provenance history as additionalProperty", () => {
      const item = createInboxItem({ name: "Task" });
      const ld = toJsonLd(item);

      const history = getProp(ld, "app:provenanceHistory") as unknown[];
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(
        expect.objectContaining({ action: "created" }),
      );
    });
  });

  describe("Action → schema:Action", () => {
    it("uses @type Action", () => {
      const action = createAction({ name: "Call dentist", bucket: "next" });
      const ld = toJsonLd(action);

      expect(ld["@type"]).toBe("Action");
    });

    it("maps scheduledDate to schema.org startDate", () => {
      const action = createAction({
        name: "Meeting",
        bucket: "calendar",
        scheduledDate: "2026-03-01",
      });
      const ld = toJsonLd(action);

      expect(ld.startDate).toBe("2026-03-01");
    });

    it("maps completedAt to schema.org endDate", () => {
      const action = createAction({
        name: "Done task",
        completedAt: "2026-02-01T10:00:00Z",
      });
      const ld = toJsonLd(action);

      expect(ld.endDate).toBe("2026-02-01T10:00:00Z");
    });

    it("maps projectId to schema.org isPartOf", () => {
      const action = createAction({
        name: "Sub-task",
        projectId: "urn:app:project:p-1" as CanonicalId,
      });
      const ld = toJsonLd(action);

      expect(ld.isPartOf).toEqual({ "@id": "urn:app:project:p-1" });
    });

    it("stores isFocused as additionalProperty", () => {
      const action = createAction({
        name: "Focus task",
        isFocused: true,
      });
      const ld = toJsonLd(action);

      expectPropertyValue(ld, "app:isFocused", true);
    });

    it("stores dueDate as additionalProperty", () => {
      const action = createAction({
        name: "Deadline task",
        dueDate: "2026-06-01",
      });
      const ld = toJsonLd(action);

      expectPropertyValue(ld, "app:dueDate", "2026-06-01");
    });

    it("stores delegatedTo as additionalProperty", () => {
      const action = createAction({
        name: "Waiting",
        bucket: "waiting",
        delegatedTo: "Sarah",
      });
      const ld = toJsonLd(action);

      expectPropertyValue(ld, "app:delegatedTo", "Sarah");
    });

    it("stores sequenceOrder as additionalProperty", () => {
      const action = createAction({
        name: "Step 2",
        sequenceOrder: 2,
      });
      const ld = toJsonLd(action);

      expectPropertyValue(ld, "app:sequenceOrder", 2);
    });

    it("stores recurrence as additionalProperty", () => {
      const action = createAction({
        name: "Weekly",
        recurrence: { kind: "weekly", interval: 1, daysOfWeek: [5] },
      });
      const ld = toJsonLd(action);

      expectPropertyValue(ld, "app:recurrence", {
        kind: "weekly",
        interval: 1,
        daysOfWeek: [5],
      });
    });
  });

  describe("Project → schema:Project", () => {
    it("uses @type Project", () => {
      const project = createProject({
        name: "Renovate kitchen",
        desiredOutcome: "Modern kitchen",
      });
      const ld = toJsonLd(project);

      expect(ld["@type"]).toBe("Project");
    });

    it("maps actionIds to schema.org hasPart", () => {
      const project = createProject({
        name: "Build feature",
        desiredOutcome: "Feature shipped",
        actionIds: [
          "urn:app:action:a-1" as CanonicalId,
          "urn:app:action:a-2" as CanonicalId,
        ],
      });
      const ld = toJsonLd(project);

      expect(ld.hasPart).toEqual([
        { "@id": "urn:app:action:a-1" },
        { "@id": "urn:app:action:a-2" },
      ]);
    });

    it("stores desiredOutcome as additionalProperty", () => {
      const project = createProject({
        name: "Renovate",
        desiredOutcome: "Modern kitchen",
      });
      const ld = toJsonLd(project);

      expectPropertyValue(ld, "app:desiredOutcome", "Modern kitchen");
    });

    it("stores projectStatus as additionalProperty", () => {
      const project = createProject({
        name: "Renovate",
        desiredOutcome: "Done",
      });
      const ld = toJsonLd(project);

      expectPropertyValue(ld, "app:projectStatus", "active");
    });

    it("stores isFocused as additionalProperty", () => {
      const project = createProject({
        name: "P",
        desiredOutcome: "D",
        isFocused: true,
      });
      const ld = toJsonLd(project);

      expectPropertyValue(ld, "app:isFocused", true);
    });

    it("stores reviewDate as additionalProperty when present", () => {
      const project = createProject({
        name: "P",
        desiredOutcome: "D",
        reviewDate: "2026-03-01",
      });
      const ld = toJsonLd(project);

      expectPropertyValue(ld, "app:reviewDate", "2026-03-01");
    });
  });

  describe("ReferenceMaterial → schema:CreativeWork", () => {
    it("uses @type CreativeWork", () => {
      const ref = createReferenceMaterial({ name: "Tax docs 2024" });
      const ld = toJsonLd(ref);

      expect(ld["@type"]).toBe("CreativeWork");
    });

    it("maps url to schema.org url", () => {
      const ref = createReferenceMaterial({
        name: "Tax docs",
        url: "https://example.com/docs",
      });
      const ld = toJsonLd(ref);

      expect(ld.url).toBe("https://example.com/docs");
    });

    it("maps encodingFormat to schema.org encodingFormat", () => {
      const ref = createReferenceMaterial({
        name: "Tax docs",
        encodingFormat: "application/pdf",
      });
      const ld = toJsonLd(ref);

      expect(ld.encodingFormat).toBe("application/pdf");
    });

    it("stores origin as additionalProperty", () => {
      const ref = createReferenceMaterial({ name: "Docs" });
      const ld = toJsonLd(ref);

      expectPropertyValue(ld, "app:origin", "captured");
    });

    it("does not emit externalUrl or contentType fields", () => {
      const ref = createReferenceMaterial({
        name: "Docs",
        url: "https://example.com",
        encodingFormat: "text/html",
      });
      const ld = toJsonLd(ref);

      expect(ld).not.toHaveProperty("externalUrl");
      expect(ld).not.toHaveProperty("contentType");
    });
  });
});

// ---------------------------------------------------------------------------
// fromJsonLd — v2 schema.org format → frontend types
// ---------------------------------------------------------------------------

describe("fromJsonLd", () => {
  describe("schema:Thing → InboxItem", () => {
    it("deserializes a Thing with additionalProperty", () => {
      const record = wrapAsThingRecord({
        "@id": "urn:app:inbox:abc-123",
        "@type": "Thing",
        _schemaVersion: 2,
        name: "Buy milk",
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        keywords: [],
        additionalProperty: [
          { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
          { "@type": "PropertyValue", propertyID: "app:rawCapture", value: "Buy milk" },
          { "@type": "PropertyValue", propertyID: "app:needsEnrichment", value: true },
          { "@type": "PropertyValue", propertyID: "app:confidence", value: "low" },
          { "@type": "PropertyValue", propertyID: "app:captureSource", value: { kind: "thought" } },
          { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          { "@type": "PropertyValue", propertyID: "app:typedReferences", value: [] },
          { "@type": "PropertyValue", propertyID: "app:provenanceHistory", value: [{ timestamp: "2025-01-01T00:00:00Z", action: "created" }] },
        ],
      });

      const item = fromJsonLd(record) as Thing;
      expect(item.bucket).toBe("inbox");
      expect(item.id).toBe("urn:app:inbox:abc-123");
      expect(item.name).toBe("Buy milk");
      expect(item.rawCapture).toBe("Buy milk");
      expect(item.needsEnrichment).toBe(true);
      expect(item.confidence).toBe("low");
      expect(item.tags).toEqual([]);
      expect(item.provenance.createdAt).toBe("2025-01-01T00:00:00Z");
      expect(item.provenance.history).toHaveLength(1);
    });
  });

  describe("schema:Action → Action", () => {
    it("deserializes an Action with schema.org + additionalProperty", () => {
      const record = wrapAsThingRecord({
        "@id": "urn:app:action:def-456",
        "@type": "Action",
        _schemaVersion: 2,
        name: "Call dentist",
        startDate: "2026-03-01",
        endDate: null,
        isPartOf: { "@id": "urn:app:project:p-1" },
        keywords: ["health"],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-02T00:00:00Z",
        additionalProperty: [
          { "@type": "PropertyValue", propertyID: "app:bucket", value: "next" },
          { "@type": "PropertyValue", propertyID: "app:isFocused", value: true },
          { "@type": "PropertyValue", propertyID: "app:dueDate", value: "2026-06-01" },
          { "@type": "PropertyValue", propertyID: "app:needsEnrichment", value: false },
          { "@type": "PropertyValue", propertyID: "app:confidence", value: "high" },
          { "@type": "PropertyValue", propertyID: "app:captureSource", value: { kind: "thought" } },
          { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          { "@type": "PropertyValue", propertyID: "app:typedReferences", value: [] },
          { "@type": "PropertyValue", propertyID: "app:provenanceHistory", value: [] },
        ],
      });

      const action = fromJsonLd(record) as Thing;
      expect(action.bucket).toBe("next");
      expect(action.name).toBe("Call dentist");
      expect(action.isFocused).toBe(true);
      expect(action.dueDate).toBe("2026-06-01");
      expect(action.scheduledDate).toBe("2026-03-01");
      expect(action.projectId).toBe("urn:app:project:p-1");
      expect(action.tags).toEqual(["health"]);
    });
  });

  describe("schema:Project → Project", () => {
    it("deserializes a Project with hasPart → actionIds", () => {
      const record = wrapAsThingRecord({
        "@id": "urn:app:project:ghi-789",
        "@type": "Project",
        _schemaVersion: 2,
        name: "Renovate kitchen",
        description: "Make it modern",
        hasPart: [{ "@id": "urn:app:action:a-1" }, { "@id": "urn:app:action:a-2" }],
        keywords: [],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          { "@type": "PropertyValue", propertyID: "app:bucket", value: "project" },
          { "@type": "PropertyValue", propertyID: "app:desiredOutcome", value: "Modern kitchen" },
          { "@type": "PropertyValue", propertyID: "app:projectStatus", value: "active" },
          { "@type": "PropertyValue", propertyID: "app:isFocused", value: false },
          { "@type": "PropertyValue", propertyID: "app:needsEnrichment", value: false },
          { "@type": "PropertyValue", propertyID: "app:confidence", value: "high" },
          { "@type": "PropertyValue", propertyID: "app:captureSource", value: { kind: "thought" } },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          { "@type": "PropertyValue", propertyID: "app:typedReferences", value: [] },
          { "@type": "PropertyValue", propertyID: "app:provenanceHistory", value: [] },
        ],
      });

      const project = fromJsonLd(record) as Project;
      expect(project.bucket).toBe("project");
      expect(project.name).toBe("Renovate kitchen");
      expect(project.description).toBe("Make it modern");
      expect(project.desiredOutcome).toBe("Modern kitchen");
      expect(project.status).toBe("active");
      expect(project.actionIds).toEqual([
        "urn:app:action:a-1",
        "urn:app:action:a-2",
      ]);
      expect(project.isFocused).toBe(false);
    });
  });

  describe("schema:CreativeWork → ReferenceMaterial", () => {
    it("deserializes a CreativeWork with url and encodingFormat", () => {
      const record = wrapAsThingRecord({
        "@id": "urn:app:reference:jkl-012",
        "@type": "CreativeWork",
        _schemaVersion: 2,
        name: "Tax docs",
        url: "https://example.com",
        encodingFormat: "text/html",
        keywords: [],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          { "@type": "PropertyValue", propertyID: "app:bucket", value: "reference" },
          { "@type": "PropertyValue", propertyID: "app:origin", value: "captured" },
          { "@type": "PropertyValue", propertyID: "app:needsEnrichment", value: false },
          { "@type": "PropertyValue", propertyID: "app:confidence", value: "medium" },
          { "@type": "PropertyValue", propertyID: "app:captureSource", value: { kind: "thought" } },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          { "@type": "PropertyValue", propertyID: "app:typedReferences", value: [] },
          { "@type": "PropertyValue", propertyID: "app:provenanceHistory", value: [] },
        ],
      });

      const ref = fromJsonLd(record) as ReferenceMaterial;
      expect(ref.bucket).toBe("reference");
      expect(ref.name).toBe("Tax docs");
      expect(ref.url).toBe("https://example.com");
      expect(ref.encodingFormat).toBe("text/html");
      expect(ref.origin).toBe("captured");
    });
  });

  describe("unknown @type fallback", () => {
    it("falls back to inbox for unknown @type", () => {
      const record = wrapAsThingRecord({
        "@id": "urn:app:inbox:unknown-1",
        "@type": "SomeFutureType",
        _schemaVersion: 2,
        name: "Unknown thing",
        keywords: [],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
          { "@type": "PropertyValue", propertyID: "app:needsEnrichment", value: true },
          { "@type": "PropertyValue", propertyID: "app:confidence", value: "low" },
          { "@type": "PropertyValue", propertyID: "app:captureSource", value: { kind: "thought" } },
          { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          { "@type": "PropertyValue", propertyID: "app:typedReferences", value: [] },
          { "@type": "PropertyValue", propertyID: "app:provenanceHistory", value: [] },
        ],
      });

      const item = fromJsonLd(record);
      expect(item.bucket).toBe("inbox");
      expect(item.name).toBe("Unknown thing");
    });
  });

  describe("round-trip: toJsonLd → wrapAsThingRecord → fromJsonLd", () => {
    beforeEach(() => resetFactoryCounter());

    it("preserves inbox item data", () => {
      const original = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(original);
      const record = wrapAsThingRecord(ld);
      const restored = fromJsonLd(record) as Thing;

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.bucket).toBe("inbox");
      expect(restored.rawCapture).toBe(original.rawCapture);
      expect(restored.needsEnrichment).toBe(true);
      expect(restored.confidence).toBe("low");
    });

    it("preserves action data with all fields", () => {
      const original = createAction({
        name: "Write tests",
        bucket: "next",
        isFocused: true,
        dueDate: "2025-12-31",
        scheduledDate: "2025-12-01",
        projectId: "urn:app:project:p-1" as CanonicalId,
        delegatedTo: "Bob",
        sequenceOrder: 3,
      });

      const ld = toJsonLd(original);
      const record = wrapAsThingRecord(ld);
      const restored = fromJsonLd(record) as Thing;

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.bucket).toBe(original.bucket);
      expect(restored.isFocused).toBe(true);
      expect(restored.dueDate).toBe("2025-12-31");
      expect(restored.scheduledDate).toBe("2025-12-01");
      expect(restored.projectId).toBe("urn:app:project:p-1");
      expect(restored.delegatedTo).toBe("Bob");
      expect(restored.sequenceOrder).toBe(3);
    });

    it("preserves project data", () => {
      const original = createProject({
        name: "Big project",
        desiredOutcome: "Ship it",
        actionIds: ["urn:app:action:a-1" as CanonicalId],
      });

      const ld = toJsonLd(original);
      const record = wrapAsThingRecord(ld);
      const restored = fromJsonLd(record) as Project;

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.desiredOutcome).toBe("Ship it");
      expect(restored.actionIds).toEqual(["urn:app:action:a-1"]);
      expect(restored.status).toBe("active");
    });

    it("preserves reference material data", () => {
      const original = createReferenceMaterial({
        name: "SGB III",
        url: "https://example.com/sgb",
        encodingFormat: "text/html",
      });

      const ld = toJsonLd(original);
      const record = wrapAsThingRecord(ld);
      const restored = fromJsonLd(record) as ReferenceMaterial;

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.url).toBe("https://example.com/sgb");
      expect(restored.encodingFormat).toBe("text/html");
      expect(restored.origin).toBe("captured");
    });
  });
});

// ---------------------------------------------------------------------------
// buildTriagePatch — v2 format
// ---------------------------------------------------------------------------

describe("buildTriagePatch", () => {
  beforeEach(() => resetFactoryCounter());

  it("produces @type Action when triaging to 'next'", () => {
    const item = createInboxItem({ name: "Buy milk" });
    const patch = buildTriagePatch(item, { targetBucket: "next" });

    expect(patch["@type"]).toBe("Action");
    expectPropertyValue(patch, "app:bucket", "next");
  });

  it("includes isPartOf when projectId provided", () => {
    const item = createInboxItem({ name: "Task" });
    const patch = buildTriagePatch(item, {
      targetBucket: "next",
      projectId: "urn:app:project:p-1" as CanonicalId,
    });

    expect(patch.isPartOf).toEqual({ "@id": "urn:app:project:p-1" });
  });

  it("maps date to schema.org startDate", () => {
    const item = createInboxItem({ name: "Task" });
    const patch = buildTriagePatch(item, {
      targetBucket: "calendar",
      date: "2025-06-15",
    });

    expect(patch.startDate).toBe("2025-06-15");
  });

  it("produces @type CreativeWork when triaging to reference", () => {
    const item = createInboxItem({ name: "Docs" });
    const patch = buildTriagePatch(item, { targetBucket: "reference" });

    expect(patch["@type"]).toBe("CreativeWork");
    expectPropertyValue(patch, "app:bucket", "reference");
  });

  it("includes energy level as additionalProperty", () => {
    const item = createInboxItem({ name: "Task" });
    const patch = buildTriagePatch(item, {
      targetBucket: "next",
      energyLevel: "high",
    });

    const ports = getProp(patch, "app:ports") as unknown[];
    expect(ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "computation", energyLevel: "high" }),
      ]),
    );
  });

  it("includes contexts as additionalProperty", () => {
    const item = createInboxItem({ name: "Task" });
    const patch = buildTriagePatch(item, {
      targetBucket: "next",
      contexts: ["@phone"],
    });

    expectPropertyValue(patch, "app:contexts", ["@phone"]);
  });
});

// ---------------------------------------------------------------------------
// buildItemEditPatch — v2 format with additionalProperty
// ---------------------------------------------------------------------------

describe("buildItemEditPatch", () => {
  it("maps dueDate to additionalProperty", () => {
    const patch = buildItemEditPatch({ dueDate: "2026-06-01" });
    expectPropertyValue(patch, "app:dueDate", "2026-06-01");
  });

  it("maps scheduledDate to schema.org startDate", () => {
    const patch = buildItemEditPatch({ scheduledDate: "2026-06-15" });
    expect(patch.startDate).toBe("2026-06-15");
  });

  it("maps contexts to additionalProperty", () => {
    const patch = buildItemEditPatch({ contexts: ["@phone", "@office"] });
    expectPropertyValue(patch, "app:contexts", ["@phone", "@office"]);
  });

  it("maps projectId to schema.org isPartOf", () => {
    const patch = buildItemEditPatch({
      projectId: "urn:app:project:p-1" as CanonicalId,
    });
    expect(patch.isPartOf).toEqual({ "@id": "urn:app:project:p-1" });
  });

  it("maps description to schema.org description", () => {
    const patch = buildItemEditPatch({ description: "New notes" });
    expect(patch.description).toBe("New notes");
  });

  it("maps energyLevel to computation port in additionalProperty", () => {
    const patch = buildItemEditPatch({ energyLevel: "high" });
    expectPropertyValue(patch, "app:ports", [
      { kind: "computation", energyLevel: "high" },
    ]);
  });

  it("nulls dueDate when empty string", () => {
    const patch = buildItemEditPatch({ dueDate: "" });
    expectPropertyValue(patch, "app:dueDate", null);
  });

  it("nulls scheduledDate when empty string", () => {
    const patch = buildItemEditPatch({ scheduledDate: "" });
    expect(patch.startDate).toBeNull();
  });

  it("only includes provided fields", () => {
    const patch = buildItemEditPatch({ contexts: ["@home"] });
    const props = patch.additionalProperty as unknown[];
    expect(props).toHaveLength(1);
    expect(patch).not.toHaveProperty("startDate");
    expect(patch).not.toHaveProperty("isPartOf");
    expect(patch).not.toHaveProperty("description");
  });
});

// ---------------------------------------------------------------------------
// buildNewInboxJsonLd — v2 format
// ---------------------------------------------------------------------------

describe("buildNewInboxJsonLd", () => {
  it("creates a schema:Thing with _schemaVersion 2", () => {
    const ld = buildNewInboxJsonLd("Call the plumber");

    expect(ld["@type"]).toBe("Thing");
    expect(ld._schemaVersion).toBe(2);
  });

  it("omits name (raw capture goes into additionalProperty only)", () => {
    const ld = buildNewInboxJsonLd("Call the plumber");

    expect(ld).not.toHaveProperty("name");
    expectPropertyValue(ld, "app:rawCapture", "Call the plumber");
  });

  it("includes dateCreated and dateModified", () => {
    const ld = buildNewInboxJsonLd("Task");

    expect(typeof ld.dateCreated).toBe("string");
    expect(typeof ld.dateModified).toBe("string");
  });

  it("stores bucket and rawCapture as additionalProperty", () => {
    const ld = buildNewInboxJsonLd("Call the plumber");

    expectPropertyValue(ld, "app:bucket", "inbox");
    expectPropertyValue(ld, "app:rawCapture", "Call the plumber");
    expectPropertyValue(ld, "app:needsEnrichment", true);
    expectPropertyValue(ld, "app:confidence", "low");
  });

  it("generates unique @id with urn:app: prefix", () => {
    const ld1 = buildNewInboxJsonLd("First");
    const ld2 = buildNewInboxJsonLd("Second");

    expect(ld1["@id"]).not.toBe(ld2["@id"]);
    expect((ld1["@id"] as string).startsWith("urn:app:inbox:")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildNewReferenceJsonLd — v2 format
// ---------------------------------------------------------------------------

describe("buildNewReferenceJsonLd", () => {
  it("creates a schema:CreativeWork with _schemaVersion 2", () => {
    const ld = buildNewReferenceJsonLd("SGB III § 159");

    expect(ld["@type"]).toBe("CreativeWork");
    expect(ld._schemaVersion).toBe(2);
  });

  it("uses schema.org name property", () => {
    const ld = buildNewReferenceJsonLd("SGB III § 159");

    expect(ld.name).toBe("SGB III § 159");
    expect(ld).not.toHaveProperty("title");
  });

  it("stores origin as additionalProperty", () => {
    const ld = buildNewReferenceJsonLd("SGB III § 159");

    expectPropertyValue(ld, "app:bucket", "reference");
    expectPropertyValue(ld, "app:origin", "captured");
  });

  it("generates unique @id with urn:app: prefix", () => {
    const ld1 = buildNewReferenceJsonLd("First");
    const ld2 = buildNewReferenceJsonLd("Second");

    expect(ld1["@id"]).not.toBe(ld2["@id"]);
    expect((ld1["@id"] as string).startsWith("urn:app:reference:")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildNewActionJsonLd — v2 format (rawCapture-first, no name)
// ---------------------------------------------------------------------------

describe("buildNewActionJsonLd", () => {
  it("creates a schema:Action with _schemaVersion 2", () => {
    const ld = buildNewActionJsonLd("Wireframes erstellen", "next");

    expect(ld["@type"]).toBe("Action");
    expect(ld._schemaVersion).toBe(2);
  });

  it("omits name (raw text goes into rawCapture)", () => {
    const ld = buildNewActionJsonLd("Wireframes erstellen", "next");

    expect(ld).not.toHaveProperty("name");
    expectPropertyValue(ld, "app:rawCapture", "Wireframes erstellen");
  });

  it("stores bucket as additionalProperty", () => {
    const ld = buildNewActionJsonLd("Task", "waiting");

    expectPropertyValue(ld, "app:bucket", "waiting");
  });

  it("includes isPartOf when projectId provided", () => {
    const ld = buildNewActionJsonLd("Sub-task", "next", {
      projectId: "urn:app:project:p-1" as CanonicalId,
    });

    expect(ld.isPartOf).toEqual({ "@id": "urn:app:project:p-1" });
  });

  it("generates unique @id with urn:app:action: prefix", () => {
    const ld1 = buildNewActionJsonLd("First", "next");
    const ld2 = buildNewActionJsonLd("Second", "next");

    expect(ld1["@id"]).not.toBe(ld2["@id"]);
    expect((ld1["@id"] as string).startsWith("urn:app:action:")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fromJsonLd — name normalization (null, missing, empty, whitespace → undefined)
// ---------------------------------------------------------------------------

describe("fromJsonLd name normalization", () => {
  it("normalizes name: null to undefined", () => {
    const record = wrapAsThingRecord({
      "@id": "urn:app:inbox:n1",
      "@type": "Thing",
      _schemaVersion: 2,
      name: null,
      keywords: [],
      dateCreated: "2025-01-01T00:00:00Z",
      dateModified: "2025-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        { "@type": "PropertyValue", propertyID: "app:rawCapture", value: "buy bananas" },
        { "@type": "PropertyValue", propertyID: "app:needsEnrichment", value: true },
        { "@type": "PropertyValue", propertyID: "app:confidence", value: "low" },
        { "@type": "PropertyValue", propertyID: "app:captureSource", value: { kind: "thought" } },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        { "@type": "PropertyValue", propertyID: "app:typedReferences", value: [] },
        { "@type": "PropertyValue", propertyID: "app:provenanceHistory", value: [] },
      ],
    });
    const item = fromJsonLd(record) as Thing;
    expect(item.name).toBeUndefined();
    expect(item.rawCapture).toBe("buy bananas");
  });

  it("normalizes missing name to undefined", () => {
    const record = wrapAsThingRecord({
      "@id": "urn:app:inbox:n2",
      "@type": "Thing",
      _schemaVersion: 2,
      keywords: [],
      dateCreated: "2025-01-01T00:00:00Z",
      dateModified: "2025-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        { "@type": "PropertyValue", propertyID: "app:rawCapture", value: "buy bananas" },
        { "@type": "PropertyValue", propertyID: "app:needsEnrichment", value: true },
        { "@type": "PropertyValue", propertyID: "app:confidence", value: "low" },
        { "@type": "PropertyValue", propertyID: "app:captureSource", value: { kind: "thought" } },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        { "@type": "PropertyValue", propertyID: "app:typedReferences", value: [] },
        { "@type": "PropertyValue", propertyID: "app:provenanceHistory", value: [] },
      ],
    });
    const item = fromJsonLd(record) as Thing;
    expect(item.name).toBeUndefined();
  });

  it("normalizes empty string name to undefined", () => {
    const record = wrapAsThingRecord({
      "@id": "urn:app:inbox:n3",
      "@type": "Thing",
      _schemaVersion: 2,
      name: "",
      keywords: [],
      dateCreated: "2025-01-01T00:00:00Z",
      dateModified: "2025-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        { "@type": "PropertyValue", propertyID: "app:rawCapture", value: "buy bananas" },
        { "@type": "PropertyValue", propertyID: "app:needsEnrichment", value: true },
        { "@type": "PropertyValue", propertyID: "app:confidence", value: "low" },
        { "@type": "PropertyValue", propertyID: "app:captureSource", value: { kind: "thought" } },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        { "@type": "PropertyValue", propertyID: "app:typedReferences", value: [] },
        { "@type": "PropertyValue", propertyID: "app:provenanceHistory", value: [] },
      ],
    });
    const item = fromJsonLd(record) as Thing;
    expect(item.name).toBeUndefined();
  });

  it("normalizes whitespace-only name to undefined", () => {
    const record = wrapAsThingRecord({
      "@id": "urn:app:inbox:n4",
      "@type": "Thing",
      _schemaVersion: 2,
      name: "   ",
      keywords: [],
      dateCreated: "2025-01-01T00:00:00Z",
      dateModified: "2025-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        { "@type": "PropertyValue", propertyID: "app:rawCapture", value: "buy bananas" },
        { "@type": "PropertyValue", propertyID: "app:needsEnrichment", value: true },
        { "@type": "PropertyValue", propertyID: "app:confidence", value: "low" },
        { "@type": "PropertyValue", propertyID: "app:captureSource", value: { kind: "thought" } },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        { "@type": "PropertyValue", propertyID: "app:typedReferences", value: [] },
        { "@type": "PropertyValue", propertyID: "app:provenanceHistory", value: [] },
      ],
    });
    const item = fromJsonLd(record) as Thing;
    expect(item.name).toBeUndefined();
  });

  it("preserves actual name when set", () => {
    const record = wrapAsThingRecord({
      "@id": "urn:app:inbox:n5",
      "@type": "Thing",
      _schemaVersion: 2,
      name: "Weekly Groceries",
      keywords: [],
      dateCreated: "2025-01-01T00:00:00Z",
      dateModified: "2025-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        { "@type": "PropertyValue", propertyID: "app:rawCapture", value: "buy bananas" },
        { "@type": "PropertyValue", propertyID: "app:needsEnrichment", value: true },
        { "@type": "PropertyValue", propertyID: "app:confidence", value: "low" },
        { "@type": "PropertyValue", propertyID: "app:captureSource", value: { kind: "thought" } },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        { "@type": "PropertyValue", propertyID: "app:typedReferences", value: [] },
        { "@type": "PropertyValue", propertyID: "app:provenanceHistory", value: [] },
      ],
    });
    const item = fromJsonLd(record) as Thing;
    expect(item.name).toBe("Weekly Groceries");
    expect(item.rawCapture).toBe("buy bananas");
  });
});

// ---------------------------------------------------------------------------
// Roundtrip: rawCapture-only action → toJsonLd → fromJsonLd
// ---------------------------------------------------------------------------

describe("roundtrip rawCapture-only", () => {
  beforeEach(() => resetFactoryCounter());

  it("preserves rawCapture-only action through serialization", () => {
    const original = createAction({ rawCapture: "Wireframes erstellen", bucket: "next" });
    const ld = toJsonLd(original);

    // Name should be omitted from JSON-LD
    expect(ld).not.toHaveProperty("name");
    expectPropertyValue(ld, "app:rawCapture", "Wireframes erstellen");

    const record = wrapAsThingRecord(ld);
    const restored = fromJsonLd(record) as Thing;

    expect(restored.name).toBeUndefined();
    expect(restored.rawCapture).toBe("Wireframes erstellen");
    expect(restored.bucket).toBe("next");
  });

  it("preserves rawCapture-only inbox item through serialization", () => {
    const original = createInboxItem({ rawCapture: "Bananen kaufen" });
    const ld = toJsonLd(original);

    expect(ld).not.toHaveProperty("name");
    expectPropertyValue(ld, "app:rawCapture", "Bananen kaufen");

    const record = wrapAsThingRecord(ld);
    const restored = fromJsonLd(record) as Thing;

    expect(restored.name).toBeUndefined();
    expect(restored.rawCapture).toBe("Bananen kaufen");
    expect(restored.bucket).toBe("inbox");
  });
});

// ---------------------------------------------------------------------------
// JSON Schema contract validation
// ---------------------------------------------------------------------------
// These tests validate that the serializer output conforms to the JSON Schema
// generated from the backend Pydantic models. If the backend changes its
// models and the schemas are regenerated, these tests break automatically.
// ---------------------------------------------------------------------------

describe("JSON Schema contract validation", () => {
  beforeEach(() => resetFactoryCounter());

  describe("build* functions produce schema-valid payloads", () => {
    it("buildNewInboxJsonLd → inbox-thing.schema.json", () => {
      const ld = buildNewInboxJsonLd("Anruf bei Frau Müller");
      const valid = validateInboxThing(ld);
      expect(valid, formatErrors(validateInboxThing)).toBe(true);
    });

    it("buildNewActionJsonLd → action-thing.schema.json", () => {
      const ld = buildNewActionJsonLd("Wireframes erstellen", "next");
      const valid = validateActionThing(ld);
      expect(valid, formatErrors(validateActionThing)).toBe(true);
    });

    it("buildNewActionJsonLd with projectId → action-thing.schema.json", () => {
      const ld = buildNewActionJsonLd("Sub-task", "next", {
        projectId: "urn:app:project:p-1" as CanonicalId,
      });
      const valid = validateActionThing(ld);
      expect(valid, formatErrors(validateActionThing)).toBe(true);
    });

    it("buildNewReferenceJsonLd → reference-thing.schema.json", () => {
      const ld = buildNewReferenceJsonLd("SGB III § 159");
      const valid = validateReferenceThing(ld);
      expect(valid, formatErrors(validateReferenceThing)).toBe(true);
    });
  });

  describe("toJsonLd produces schema-valid payloads", () => {
    it("inbox item → inbox-thing.schema.json", () => {
      const item = createInboxItem({ rawCapture: "Buy milk" });
      const ld = toJsonLd(item);
      const valid = validateInboxThing(ld);
      expect(valid, formatErrors(validateInboxThing)).toBe(true);
    });

    it("action → action-thing.schema.json", () => {
      const action = createAction({
        rawCapture: "Call dentist",
        bucket: "next",
        isFocused: true,
        dueDate: "2026-06-01",
      });
      const ld = toJsonLd(action);
      const valid = validateActionThing(ld);
      expect(valid, formatErrors(validateActionThing)).toBe(true);
    });

    it("project → project-thing.schema.json", () => {
      const project = createProject({
        name: "Renovate kitchen",
        desiredOutcome: "Modern kitchen",
        actionIds: ["urn:app:action:a-1" as CanonicalId],
      });
      const ld = toJsonLd(project);
      const valid = validateProjectThing(ld);
      expect(valid, formatErrors(validateProjectThing)).toBe(true);
    });

    it("reference → reference-thing.schema.json", () => {
      const ref = createReferenceMaterial({
        name: "Tax docs",
        url: "https://example.com",
        encodingFormat: "text/html",
      });
      const ld = toJsonLd(ref);
      const valid = validateReferenceThing(ld);
      expect(valid, formatErrors(validateReferenceThing)).toBe(true);
    });
  });

  describe("patch functions produce schema-valid payloads", () => {
    it("buildTriagePatch → thing-patch.schema.json", () => {
      const item = createInboxItem({ rawCapture: "Buy milk" });
      const patch = buildTriagePatch(item, { targetBucket: "next" });
      const valid = validateThingPatch(patch);
      expect(valid, formatErrors(validateThingPatch)).toBe(true);
    });

    it("buildItemEditPatch → thing-patch.schema.json", () => {
      const patch = buildItemEditPatch({
        dueDate: "2026-06-01",
        contexts: ["@phone"],
        description: "Updated notes",
      });
      const valid = validateThingPatch(patch);
      expect(valid, formatErrors(validateThingPatch)).toBe(true);
    });
  });
});
