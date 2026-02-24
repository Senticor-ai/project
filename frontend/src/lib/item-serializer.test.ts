import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  toJsonLd,
  fromJsonLd,
  buildTriagePatch,
  buildItemEditPatch,
  buildNewInboxJsonLd,
  buildNewActionJsonLd,
  buildNewReferenceJsonLd,
  buildNewProjectJsonLd,
  buildNewFileInboxJsonLd,
  buildNewUrlInboxJsonLd,
} from "./item-serializer";
import {
  createInboxItem,
  createAction,
  createProject,
  createReferenceMaterial,
  resetFactoryCounter,
} from "@/model/factories";
import type { ItemRecord } from "./api-client";
import type {
  ActionItem,
  Project,
  ReferenceMaterial,
  CalendarEntry,
} from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";
import {
  isBackendAvailable,
  loadValidators,
  formatErrors,
  type SchemaValidators,
} from "./__tests__/schema-validator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapAsItemRecord(
  item: Record<string, unknown>,
  overrides?: Partial<ItemRecord>,
): ItemRecord {
  return {
    item_id: overrides?.item_id ?? "uuid-1",
    canonical_id: overrides?.canonical_id ?? (item["@id"] as string),
    source: overrides?.source ?? "manual",
    item,
    created_at: overrides?.created_at ?? "2025-01-01T00:00:00Z",
    updated_at: overrides?.updated_at ?? "2025-01-01T00:00:00Z",
  };
}

/** Extract a PropertyValue's value from an additionalProperty array. */
function getProp(ld: Record<string, unknown>, propertyID: string): unknown {
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

  describe("InboxItem → schema:Action", () => {
    it("uses @type Action and _schemaVersion 2", () => {
      const item = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(item);

      expect(ld["@type"]).toBe("Action");
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

    it("stores nameProvenance as additionalProperty when provided", () => {
      const item = createAction({
        name: "Plan launch",
        bucket: "next",
        rawCapture: "plan launch",
        nameProvenance: {
          setBy: "ai",
          setAt: "2026-01-10T12:00:00Z",
          source: "AI suggested from rawCapture",
        },
      });
      const ld = toJsonLd(item);

      expectPropertyValue(ld, "app:nameProvenance", {
        setBy: "ai",
        setAt: "2026-01-10T12:00:00Z",
        source: "AI suggested from rawCapture",
      });
    });

    it("stores needsEnrichment as additionalProperty", () => {
      const item = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(item);

      expectPropertyValue(ld, "app:needsEnrichment", true);
    });

    it("stores confidence as additionalProperty", () => {
      const item = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(item);

      expectPropertyValue(ld, "app:confidence", "medium");
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

    it("maps scheduledDate to schema.org startTime", () => {
      const action = createAction({
        name: "Meeting",
        bucket: "calendar",
        scheduledDate: "2026-03-01",
      });
      const ld = toJsonLd(action);

      expect(ld.startTime).toBe("2026-03-01");
    });

    it("maps completedAt to schema.org endTime", () => {
      const action = createAction({
        name: "Done task",
        completedAt: "2026-02-01T10:00:00Z",
      });
      const ld = toJsonLd(action);

      expect(ld.endTime).toBe("2026-02-01T10:00:00Z");
    });

    it("maps projectIds to app:projectRefs additionalProperty", () => {
      const action = createAction({
        name: "Sub-task",
        projectId: "urn:app:project:p-1" as CanonicalId,
      });
      const ld = toJsonLd(action);

      expect(ld).not.toHaveProperty("isPartOf");
      expectPropertyValue(ld, "app:projectRefs", ["urn:app:project:p-1"]);
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

    it("does not include hasPart (projects no longer track actions)", () => {
      const project = createProject({
        name: "Build feature",
        desiredOutcome: "Feature shipped",
      });
      const ld = toJsonLd(project);

      expect(ld).not.toHaveProperty("hasPart");
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

    it("stores orgRef as additionalProperty when present", () => {
      const project = createProject({
        name: "Tax Prep",
        desiredOutcome: "Filed",
        orgRef: { id: "org-uuid-1", name: "Nueva Tierra" },
      });
      const ld = toJsonLd(project);

      expectPropertyValue(
        ld,
        "app:orgRef",
        JSON.stringify({ id: "org-uuid-1", name: "Nueva Tierra" }),
      );
    });

    it("omits orgRef additionalProperty when not set", () => {
      const project = createProject({
        name: "Personal",
        desiredOutcome: "Done",
      });
      const ld = toJsonLd(project);

      expect(getProp(ld, "app:orgRef")).toBeUndefined();
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

    it("stores orgRef as additionalProperty when present", () => {
      const ref = createReferenceMaterial({
        name: "Registration doc",
        orgRef: { id: "org-uuid-2", name: "Autonomo Wolfgang" },
      });
      const ld = toJsonLd(ref);

      expectPropertyValue(
        ld,
        "app:orgRef",
        JSON.stringify({ id: "org-uuid-2", name: "Autonomo Wolfgang" }),
      );
    });

    it("omits orgRef additionalProperty when not set", () => {
      const ref = createReferenceMaterial({ name: "Personal doc" });
      const ld = toJsonLd(ref);

      expect(getProp(ld, "app:orgRef")).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// fromJsonLd — v2 schema.org format → frontend types
// ---------------------------------------------------------------------------

describe("fromJsonLd", () => {
  describe("schema:Action (inbox) → InboxItem", () => {
    it("deserializes an Action in inbox with additionalProperty", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:inbox:abc-123",
        "@type": "Action",
        _schemaVersion: 2,
        name: "Buy milk",
        startTime: null,
        endTime: null,
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        keywords: [],
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: "inbox",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:rawCapture",
            value: "Buy milk",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: true,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "medium",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [{ timestamp: "2025-01-01T00:00:00Z", action: "created" }],
          },
        ],
      });

      const item = fromJsonLd(record) as ActionItem;
      expect(item.bucket).toBe("inbox");
      expect(item.id).toBe("urn:app:inbox:abc-123");
      expect(item.name).toBe("Buy milk");
      expect(item.rawCapture).toBe("Buy milk");
      expect(item.needsEnrichment).toBe(true);
      expect(item.confidence).toBe("medium");
      expect(item.tags).toEqual([]);
      expect(item.provenance.createdAt).toBe("2025-01-01T00:00:00Z");
      expect(item.provenance.history).toHaveLength(1);
    });
  });

  describe("schema:Action → Action", () => {
    it("deserializes an Action with app:projectRefs", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:action:def-456",
        "@type": "Action",
        _schemaVersion: 2,
        name: "Call dentist",
        startTime: "2026-03-01",
        endTime: null,
        keywords: ["health"],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-02T00:00:00Z",
        additionalProperty: [
          { "@type": "PropertyValue", propertyID: "app:bucket", value: "next" },
          {
            "@type": "PropertyValue",
            propertyID: "app:isFocused",
            value: true,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:dueDate",
            value: "2026-06-01",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:projectRefs",
            value: ["urn:app:project:p-1"],
          },
        ],
      });

      const action = fromJsonLd(record) as ActionItem;
      expect(action.bucket).toBe("next");
      expect(action.name).toBe("Call dentist");
      expect(action.isFocused).toBe(true);
      expect(action.dueDate).toBe("2026-06-01");
      expect(action.scheduledDate).toBe("2026-03-01");
      expect(action.projectIds).toEqual(["urn:app:project:p-1"]);
      expect(action.tags).toEqual(["health"]);
    });

    it("deserializes app:nameProvenance when present", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:action:nameprov-1",
        "@type": "Action",
        _schemaVersion: 2,
        name: "Quarterly planning",
        startTime: null,
        endTime: null,
        keywords: [],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          { "@type": "PropertyValue", propertyID: "app:bucket", value: "next" },
          {
            "@type": "PropertyValue",
            propertyID: "app:rawCapture",
            value: "do quarterly planning",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:nameProvenance",
            value: {
              setBy: "user",
              setAt: "2026-01-20T09:30:00Z",
              source: "user renamed in EditableTitle",
            },
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const action = fromJsonLd(record) as ActionItem;
      expect(action.nameProvenance).toEqual({
        setBy: "user",
        setAt: "2026-01-20T09:30:00Z",
        source: "user renamed in EditableTitle",
      });
    });
  });

  describe("schema.org action subtypes → ActionItem", () => {
    it("deserializes BuyAction as ActionItem with inbox bucket", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:action:buy-001",
        "@type": "BuyAction",
        _schemaVersion: 2,
        name: "Buy groceries",
        startTime: null,
        endTime: null,
        keywords: ["shopping"],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
          {
            "@type": "PropertyValue",
            propertyID: "app:rawCapture",
            value: "buy groceries",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const action = fromJsonLd(record) as ActionItem;
      expect(action.bucket).toBe("inbox");
      expect(action.name).toBe("Buy groceries");
      expect(action.tags).toEqual(["shopping"]);
      expect(action.rawCapture).toBe("buy groceries");
      expect(action.needsEnrichment).toBe(false);
      expect(action.confidence).toBe("high");
    });

    it("deserializes CreateAction as ActionItem with next bucket", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:action:create-001",
        "@type": "CreateAction",
        _schemaVersion: 2,
        name: "Write blog post",
        startTime: "2026-03-15",
        endTime: null,
        keywords: ["writing", "content"],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          { "@type": "PropertyValue", propertyID: "app:bucket", value: "next" },
          {
            "@type": "PropertyValue",
            propertyID: "app:isFocused",
            value: true,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:dueDate",
            value: "2026-03-20",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const action = fromJsonLd(record) as ActionItem;
      expect(action.bucket).toBe("next");
      expect(action.name).toBe("Write blog post");
      expect(action.tags).toEqual(["writing", "content"]);
      expect(action.isFocused).toBe(true);
      expect(action.dueDate).toBe("2026-03-20");
      expect(action.scheduledDate).toBe("2026-03-15");
      expect(action.needsEnrichment).toBe(false);
    });

    it("deserializes PlanAction as ActionItem with waiting bucket", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:action:plan-001",
        "@type": "PlanAction",
        _schemaVersion: 2,
        name: "Plan vacation",
        startTime: null,
        endTime: null,
        keywords: ["travel", "planning"],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: "waiting",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:delegatedTo",
            value: "Travel agent",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const action = fromJsonLd(record) as ActionItem;
      expect(action.bucket).toBe("waiting");
      expect(action.name).toBe("Plan vacation");
      expect(action.tags).toEqual(["travel", "planning"]);
      expect(action.delegatedTo).toBe("Travel agent");
      expect(action.needsEnrichment).toBe(false);
    });

    it("deserializes CommunicateAction as ActionItem", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:action:comm-001",
        "@type": "CommunicateAction",
        _schemaVersion: 2,
        name: "Email client update",
        startTime: null,
        endTime: null,
        keywords: ["email", "communication"],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          { "@type": "PropertyValue", propertyID: "app:bucket", value: "next" },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const action = fromJsonLd(record) as ActionItem;
      expect(action.bucket).toBe("next");
      expect(action.name).toBe("Email client update");
      expect(action.tags).toEqual(["email", "communication"]);
    });

    it("deserializes ReviewAction as ActionItem", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:action:review-001",
        "@type": "ReviewAction",
        _schemaVersion: 2,
        name: "Review pull request",
        startTime: null,
        endTime: null,
        keywords: ["code-review"],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          { "@type": "PropertyValue", propertyID: "app:bucket", value: "next" },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const action = fromJsonLd(record) as ActionItem;
      expect(action.bucket).toBe("next");
      expect(action.name).toBe("Review pull request");
      expect(action.tags).toEqual(["code-review"]);
    });
  });

  describe("schema:Project → Project", () => {
    it("deserializes a Project (no actionIds — projects no longer track actions)", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:project:ghi-789",
        "@type": "Project",
        _schemaVersion: 2,
        name: "Renovate kitchen",
        description: "Make it modern",
        keywords: [],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: "project",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:desiredOutcome",
            value: "Modern kitchen",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:projectStatus",
            value: "active",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:isFocused",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const project = fromJsonLd(record) as Project;
      expect(project.bucket).toBe("project");
      expect(project.name).toBe("Renovate kitchen");
      expect(project.description).toBe("Make it modern");
      expect(project.desiredOutcome).toBe("Modern kitchen");
      expect(project.status).toBe("active");
      expect(project).not.toHaveProperty("actionIds");
      expect(project.isFocused).toBe(false);
    });

    it("deserializes orgRef from additionalProperty", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:project:org-test",
        "@type": "Project",
        _schemaVersion: 2,
        name: "Tax Prep NT",
        keywords: [],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: "project",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:desiredOutcome",
            value: "Filed",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:projectStatus",
            value: "active",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:isFocused",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:orgRef",
            value: JSON.stringify({ id: "org-uuid-1", name: "Nueva Tierra" }),
          },
        ],
      });

      const project = fromJsonLd(record) as Project;
      expect(project.orgRef).toEqual({
        id: "org-uuid-1",
        name: "Nueva Tierra",
      });
    });

    it("leaves orgRef undefined when not present", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:project:no-org",
        "@type": "Project",
        _schemaVersion: 2,
        name: "Personal",
        keywords: [],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: "project",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:desiredOutcome",
            value: "Done",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:projectStatus",
            value: "active",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:isFocused",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const project = fromJsonLd(record) as Project;
      expect(project.orgRef).toBeUndefined();
    });
  });

  describe("schema:CreativeWork → ReferenceMaterial", () => {
    it("deserializes a CreativeWork with url and encodingFormat", () => {
      const record = wrapAsItemRecord({
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
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: "reference",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:origin",
            value: "captured",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "medium",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const ref = fromJsonLd(record) as ReferenceMaterial;
      expect(ref.bucket).toBe("reference");
      expect(ref.name).toBe("Tax docs");
      expect(ref.url).toBe("https://example.com");
      expect(ref.encodingFormat).toBe("text/html");
      expect(ref.origin).toBe("captured");
    });

    it("deserializes orgRef from additionalProperty", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:reference:org-ref-test",
        "@type": "CreativeWork",
        _schemaVersion: 2,
        name: "Registration doc",
        keywords: [],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: "reference",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:origin",
            value: "captured",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "medium",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:orgRef",
            value: JSON.stringify({
              id: "org-uuid-2",
              name: "Autonomo Wolfgang",
            }),
          },
        ],
      });

      const ref = fromJsonLd(record) as ReferenceMaterial;
      expect(ref.orgRef).toEqual({
        id: "org-uuid-2",
        name: "Autonomo Wolfgang",
      });
    });

    it("leaves orgRef undefined when not present", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:reference:no-org",
        "@type": "CreativeWork",
        _schemaVersion: 2,
        name: "Personal note",
        keywords: [],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: "reference",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:origin",
            value: "captured",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "medium",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const ref = fromJsonLd(record) as ReferenceMaterial;
      expect(ref.orgRef).toBeUndefined();
    });
  });

  describe("schema:Event → CalendarEntry", () => {
    it("deserializes an Event with startDate and duration", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:event:evt-001",
        "@type": "Event",
        _schemaVersion: 2,
        name: "Team standup",
        startDate: "2026-03-01T09:00:00Z",
        endDate: "2026-03-01T09:30:00Z",
        duration: 30,
        location: "Room 42",
        keywords: ["meeting"],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: "calendar",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const entry = fromJsonLd(record) as CalendarEntry;
      expect(entry.bucket).toBe("calendar");
      expect(entry.name).toBe("Team standup");
      expect(entry.date).toBe("2026-03-01T09:00:00Z");
      expect(entry.duration).toBe(30);
      expect(entry.isAllDay).toBe(false);
      expect(entry.tags).toEqual(["meeting"]);
    });

    it("treats Event without time component as all-day", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:event:evt-002",
        "@type": "Event",
        _schemaVersion: 2,
        name: "Conference",
        startDate: "2026-06-15",
        keywords: [],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: "calendar",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:needsEnrichment",
            value: false,
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:confidence",
            value: "high",
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:captureSource",
            value: { kind: "thought" },
          },
          { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
          {
            "@type": "PropertyValue",
            propertyID: "app:typedReferences",
            value: [],
          },
          {
            "@type": "PropertyValue",
            propertyID: "app:provenanceHistory",
            value: [],
          },
        ],
      });

      const entry = fromJsonLd(record) as CalendarEntry;
      expect(entry.bucket).toBe("calendar");
      expect(entry.date).toBe("2026-06-15");
      expect(entry.isAllDay).toBe(true);
      expect(entry.duration).toBeUndefined();
    });
  });

  describe("unknown @type", () => {
    it("falls back to ActionItem for unknown @type", () => {
      const record = wrapAsItemRecord({
        "@id": "urn:app:inbox:unknown-1",
        "@type": "SomeFutureType",
        _schemaVersion: 2,
        name: "Unknown thing",
        keywords: [],
        dateCreated: "2025-01-01T00:00:00Z",
        dateModified: "2025-01-01T00:00:00Z",
        additionalProperty: [
          {
            "@type": "PropertyValue",
            propertyID: "app:bucket",
            value: "inbox",
          },
        ],
      });

      const item = fromJsonLd(record) as ActionItem;
      expect(item.bucket).toBe("inbox");
      expect(item.name).toBe("Unknown thing");
    });
  });

  describe("round-trip: toJsonLd → wrapAsItemRecord → fromJsonLd", () => {
    beforeEach(() => resetFactoryCounter());

    it("preserves inbox item data", () => {
      const original = createInboxItem({ name: "Buy milk" });
      const ld = toJsonLd(original);
      const record = wrapAsItemRecord(ld);
      const restored = fromJsonLd(record) as ActionItem;

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.bucket).toBe("inbox");
      expect(restored.rawCapture).toBe(original.rawCapture);
      expect(restored.needsEnrichment).toBe(true);
      expect(restored.confidence).toBe("medium");
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
      const record = wrapAsItemRecord(ld);
      const restored = fromJsonLd(record) as ActionItem;

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.bucket).toBe(original.bucket);
      expect(restored.isFocused).toBe(true);
      expect(restored.dueDate).toBe("2025-12-31");
      expect(restored.scheduledDate).toBe("2025-12-01");
      expect(restored.projectIds).toEqual(["urn:app:project:p-1"]);
      expect(restored.delegatedTo).toBe("Bob");
      expect(restored.sequenceOrder).toBe(3);
    });

    it("roundtrips nameProvenance for action items", () => {
      const original = createAction({
        name: "Refined title",
        bucket: "next",
        rawCapture: "messy captured sentence",
        nameProvenance: {
          setBy: "ai",
          setAt: "2026-02-01T12:00:00Z",
          source: "AI suggested from rawCapture",
        },
      });

      const ld = toJsonLd(original);
      const record = wrapAsItemRecord(ld);
      const restored = fromJsonLd(record) as ActionItem;

      expect(restored.nameProvenance).toEqual({
        setBy: "ai",
        setAt: "2026-02-01T12:00:00Z",
        source: "AI suggested from rawCapture",
      });
    });

    it("preserves project data", () => {
      const original = createProject({
        name: "Big project",
        desiredOutcome: "Ship it",
      });

      const ld = toJsonLd(original);
      const record = wrapAsItemRecord(ld);
      const restored = fromJsonLd(record) as Project;

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.desiredOutcome).toBe("Ship it");
      expect(restored).not.toHaveProperty("actionIds");
      expect(restored.status).toBe("active");
    });

    it("preserves reference material data", () => {
      const original = createReferenceMaterial({
        name: "SGB III",
        url: "https://example.com/sgb",
        encodingFormat: "text/html",
      });

      const ld = toJsonLd(original);
      const record = wrapAsItemRecord(ld);
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

  it("includes app:projectRefs when projectId provided", () => {
    const item = createInboxItem({ name: "Task" });
    const patch = buildTriagePatch(item, {
      targetBucket: "next",
      projectId: "urn:app:project:p-1" as CanonicalId,
    });

    expect(patch).not.toHaveProperty("isPartOf");
    expectPropertyValue(patch, "app:projectRefs", ["urn:app:project:p-1"]);
  });

  it("maps date to schema.org startTime", () => {
    const item = createInboxItem({ name: "Task" });
    const patch = buildTriagePatch(item, {
      targetBucket: "calendar",
      date: "2025-06-15",
    });

    expect(patch.startTime).toBe("2025-06-15");
  });

  it("produces @type CreativeWork when triaging to reference", () => {
    const item = createInboxItem({ name: "Docs" });
    const patch = buildTriagePatch(item, { targetBucket: "reference" });

    expect(patch["@type"]).toBe("CreativeWork");
    expectPropertyValue(patch, "app:bucket", "reference");
  });

  it("includes projectRefs when triaging to reference with projectId", () => {
    const item = createInboxItem({ name: "W-2.pdf" });
    const patch = buildTriagePatch(item, {
      targetBucket: "reference",
      projectId: "urn:copilot:project:tax2025" as CanonicalId,
    });

    expect(patch["@type"]).toBe("CreativeWork");
    expectPropertyValue(patch, "app:bucket", "reference");
    expectPropertyValue(patch, "app:projectRefs", [
      "urn:copilot:project:tax2025",
    ]);
  });

  it("omits projectRefs when triaging to reference without projectId", () => {
    const item = createInboxItem({ name: "Random doc" });
    const patch = buildTriagePatch(item, { targetBucket: "reference" });

    const props = patch.additionalProperty as Array<{
      propertyID: string;
    }>;
    expect(
      props.find((p) => p.propertyID === "app:projectRefs"),
    ).toBeUndefined();
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

  it("preserves item tags as keywords in triage to action bucket", () => {
    const item = createInboxItem({ name: "Task", tags: ["1099-int"] });
    const patch = buildTriagePatch(item, { targetBucket: "next" });
    expect(patch.keywords).toEqual(["1099-int"]);
  });

  it("preserves item tags as keywords in triage to reference", () => {
    const item = createInboxItem({
      name: "Doc",
      tags: ["schedule-b", "1099-div"],
    });
    const patch = buildTriagePatch(item, { targetBucket: "reference" });
    expect(patch.keywords).toEqual(["schedule-b", "1099-div"]);
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

  it("maps scheduledDate to schema.org startTime", () => {
    const patch = buildItemEditPatch({ scheduledDate: "2026-06-15" });
    expect(patch.startTime).toBe("2026-06-15");
  });

  it("maps contexts to additionalProperty", () => {
    const patch = buildItemEditPatch({ contexts: ["@phone", "@office"] });
    expectPropertyValue(patch, "app:contexts", ["@phone", "@office"]);
  });

  it("maps projectId to app:projectRefs additionalProperty", () => {
    const patch = buildItemEditPatch({
      projectId: "urn:app:project:p-1" as CanonicalId,
    });
    expect(patch).not.toHaveProperty("isPartOf");
    expectPropertyValue(patch, "app:projectRefs", ["urn:app:project:p-1"]);
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
    expect(patch.startTime).toBeNull();
  });

  it("only includes provided fields", () => {
    const patch = buildItemEditPatch({ contexts: ["@home"] });
    const props = patch.additionalProperty as unknown[];
    expect(props).toHaveLength(1);
    expect(patch).not.toHaveProperty("startTime");
    expect(patch).not.toHaveProperty("isPartOf");
    expect(patch).not.toHaveProperty("description");
  });

  it("maps tags to schema.org keywords", () => {
    const patch = buildItemEditPatch({ tags: ["1099-int", "schedule-b"] });
    expect(patch.keywords).toEqual(["1099-int", "schedule-b"]);
  });

  it("only includes keywords when tags provided", () => {
    const patch = buildItemEditPatch({ contexts: ["@home"] });
    expect(patch).not.toHaveProperty("keywords");
  });

  it("maps orgRef to app:orgRef additionalProperty", () => {
    const patch = buildItemEditPatch({
      orgRef: { id: "org-1", name: "Nueva Tierra" },
    });
    expectPropertyValue(
      patch,
      "app:orgRef",
      JSON.stringify({ id: "org-1", name: "Nueva Tierra" }),
    );
  });

  it("nulls orgRef when undefined", () => {
    const patch = buildItemEditPatch({ orgRef: undefined });
    expectPropertyValue(patch, "app:orgRef", null);
  });
});

// ---------------------------------------------------------------------------
// buildNewInboxJsonLd — v2 format
// ---------------------------------------------------------------------------

describe("buildNewInboxJsonLd", () => {
  it("creates a schema:Action with _schemaVersion 2", () => {
    const ld = buildNewInboxJsonLd("Call the plumber");

    expect(ld["@type"]).toBe("Action");
    expect(ld._schemaVersion).toBe(2);
    expect(ld.startTime).toBeNull();
    expect(ld.endTime).toBeNull();
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
    expectPropertyValue(ld, "app:confidence", "medium");
  });

  it("generates unique @id with urn:app: prefix", () => {
    const ld1 = buildNewInboxJsonLd("First");
    const ld2 = buildNewInboxJsonLd("Second");

    expect(ld1["@id"]).not.toBe(ld2["@id"]);
    expect((ld1["@id"] as string).startsWith("urn:app:inbox:")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildNewFileInboxJsonLd — file capture
// ---------------------------------------------------------------------------

describe("buildNewFileInboxJsonLd", () => {
  it("creates a DigitalDocument for a PDF file", () => {
    const ld = buildNewFileInboxJsonLd(
      {
        schemaType: "DigitalDocument",
        confidence: "medium",
        captureSource: {
          kind: "file",
          fileName: "report.pdf",
          mimeType: "application/pdf",
        },
        encodingFormat: "application/pdf",
      },
      "report.pdf",
    );

    expect(ld["@type"]).toBe("DigitalDocument");
    expect(ld.name).toBe("report.pdf");
    expect(ld.encodingFormat).toBe("application/pdf");
    expectPropertyValue(ld, "app:bucket", "inbox");
    expectPropertyValue(ld, "app:needsEnrichment", true);
    expectPropertyValue(ld, "app:confidence", "medium");
    expectPropertyValue(ld, "app:captureSource", {
      kind: "file",
      fileName: "report.pdf",
      mimeType: "application/pdf",
    });
  });

  it("creates an EmailMessage for .eml with extractable entities", () => {
    const ld = buildNewFileInboxJsonLd(
      {
        schemaType: "EmailMessage",
        confidence: "medium",
        captureSource: {
          kind: "file",
          fileName: "message.eml",
          mimeType: "message/rfc822",
        },
        encodingFormat: "message/rfc822",
        extractableEntities: ["Person", "Organization"],
      },
      "message.eml",
    );

    expect(ld["@type"]).toBe("EmailMessage");
    expectPropertyValue(ld, "app:extractableEntities", [
      "Person",
      "Organization",
    ]);
  });

  it("omits extractableEntities when not present", () => {
    const ld = buildNewFileInboxJsonLd(
      {
        schemaType: "DigitalDocument",
        confidence: "medium",
        captureSource: {
          kind: "file",
          fileName: "photo.jpg",
          mimeType: "image/jpeg",
        },
        encodingFormat: "image/jpeg",
      },
      "photo.jpg",
    );

    const props = ld.additionalProperty as Array<{
      propertyID: string;
      value: unknown;
    }>;
    expect(
      props.find((p) => p.propertyID === "app:extractableEntities"),
    ).toBeUndefined();
  });

  it("generates unique @id with urn:app:inbox: prefix", () => {
    const ld = buildNewFileInboxJsonLd(
      {
        schemaType: "DigitalDocument",
        confidence: "medium",
        captureSource: {
          kind: "file",
          fileName: "doc.pdf",
          mimeType: "application/pdf",
        },
      },
      "doc.pdf",
    );
    expect((ld["@id"] as string).startsWith("urn:app:inbox:")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildNewUrlInboxJsonLd — URL capture
// ---------------------------------------------------------------------------

describe("buildNewUrlInboxJsonLd", () => {
  it("creates a CreativeWork with URL in inbox", () => {
    const ld = buildNewUrlInboxJsonLd("https://example.com/article");

    expect(ld["@type"]).toBe("CreativeWork");
    expect(ld.url).toBe("https://example.com/article");
    expectPropertyValue(ld, "app:bucket", "inbox");
    expectPropertyValue(ld, "app:needsEnrichment", true);
    expectPropertyValue(ld, "app:confidence", "medium");
    expectPropertyValue(ld, "app:captureSource", {
      kind: "url",
      url: "https://example.com/article",
    });
    expectPropertyValue(ld, "app:rawCapture", "https://example.com/article");
  });

  it("generates unique @id with urn:app:inbox: prefix", () => {
    const ld1 = buildNewUrlInboxJsonLd("https://a.com");
    const ld2 = buildNewUrlInboxJsonLd("https://b.com");
    expect(ld1["@id"]).not.toBe(ld2["@id"]);
    expect((ld1["@id"] as string).startsWith("urn:app:inbox:")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fromJsonLd — Action-in-inbox and CreativeWork-in-inbox
// ---------------------------------------------------------------------------

describe("fromJsonLd — intake classification types in inbox", () => {
  it("deserializes Action with bucket inbox as an ActionItem", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:inbox:test-1",
      "@type": "Action",
      _schemaVersion: 2,
      description: null,
      keywords: [],
      dateCreated: "2025-01-01T00:00:00.000Z",
      dateModified: "2025-01-01T00:00:00.000Z",
      startTime: null,
      endTime: null,
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        {
          "@type": "PropertyValue",
          propertyID: "app:rawCapture",
          value: "Call the plumber",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: true,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "medium",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: { kind: "thought" },
        },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:isFocused",
          value: false,
        },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
      ],
    });

    const item = fromJsonLd(record);
    expect(item.bucket).toBe("inbox");
    expect("rawCapture" in item && item.rawCapture).toBe("Call the plumber");
    expect(item.confidence).toBe("medium");
    expect(item.needsEnrichment).toBe(true);
  });

  it("deserializes CreativeWork with bucket inbox as an ActionItem (URL capture)", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:inbox:test-2",
      "@type": "CreativeWork",
      _schemaVersion: 2,
      url: "https://example.com",
      description: null,
      keywords: [],
      dateCreated: "2025-01-01T00:00:00.000Z",
      dateModified: "2025-01-01T00:00:00.000Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: true,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "medium",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: { kind: "url", url: "https://example.com" },
        },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:isFocused",
          value: false,
        },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
      ],
    });

    const item = fromJsonLd(record);
    expect(item.bucket).toBe("inbox");
    expect(item.needsEnrichment).toBe(true);
  });

  it("deserializes DigitalDocument (unknown @type) as inbox fallback", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:inbox:test-3",
      "@type": "DigitalDocument",
      _schemaVersion: 2,
      name: "report.pdf",
      description: null,
      keywords: [],
      encodingFormat: "application/pdf",
      dateCreated: "2025-01-01T00:00:00.000Z",
      dateModified: "2025-01-01T00:00:00.000Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: true,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "medium",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: {
            kind: "file",
            fileName: "report.pdf",
            mimeType: "application/pdf",
          },
        },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:isFocused",
          value: false,
        },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
      ],
    });

    const item = fromJsonLd(record);
    expect(item.bucket).toBe("inbox");
    expect(item.name).toBe("report.pdf");
    expect(item.needsEnrichment).toBe(true);
  });

  it("deserializes DigitalDocument with app:bucket=reference as ReferenceMaterial", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:reference:split-1",
      "@type": "DigitalDocument",
      _schemaVersion: 2,
      name: "Bekanntmachung.pdf",
      description: null,
      keywords: [],
      encodingFormat: "application/pdf",
      dateCreated: "2026-01-01T00:00:00.000Z",
      dateModified: "2026-01-01T00:00:00.000Z",
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "app:bucket",
          value: "reference",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: false,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "high",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: {
            kind: "file",
            fileName: "Bekanntmachung.pdf",
            mimeType: "application/pdf",
          },
        },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [
            {
              timestamp: "2026-01-01T00:00:00.000Z",
              action: "created",
              splitFrom: "urn:app:inbox:orig-1",
            },
          ],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:fileId",
          value: "file-abc",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:downloadUrl",
          value: "/files/download/file-abc",
        },
      ],
    });

    const item = fromJsonLd(record);
    expect(item.bucket).toBe("reference");
    expect(item.name).toBe("Bekanntmachung.pdf");
    // Should be a ReferenceMaterial shape (with encodingFormat), not an ActionItem
    const ref = item as ReferenceMaterial;
    expect(ref.encodingFormat).toBe("application/pdf");
    expect(ref.fileId).toBe("file-abc");
    expect(ref.downloadUrl).toBe("/files/download/file-abc");
  });

  it("deserializes EmailMessage as inbox ActionItem with email captureSource", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:email:abc123",
      "@type": "EmailMessage",
      _schemaVersion: 2,
      name: "Re: Antrag auf Verlangerung",
      description: "Sehr geehrte Frau Muller...",
      keywords: [],
      dateCreated: "2026-02-11T09:30:00Z",
      dateModified: "2026-02-11T09:30:00Z",
      sender: {
        "@type": "Person",
        name: "Hans Schmidt",
        email: "hans.schmidt@example.de",
      },
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        {
          "@type": "PropertyValue",
          propertyID: "app:rawCapture",
          value: "Sehr geehrte Frau Muller...",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: true,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "medium",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: {
            kind: "email",
            subject: "Re: Antrag auf Verlangerung",
            from: "hans.schmidt@example.de",
          },
        },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:isFocused",
          value: false,
        },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:emailBody",
          value: "<p>Sehr geehrte Frau Muller...</p>",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:emailSourceUrl",
          value: "https://mail.google.com/mail/u/0/#inbox/abc123",
        },
      ],
    });

    const item = fromJsonLd(record);
    expect(item.bucket).toBe("inbox");
    expect(item.name).toBe("Re: Antrag auf Verlangerung");
    expect(item.needsEnrichment).toBe(true);
    expect(item.confidence).toBe("medium");

    // Verify email captureSource is preserved
    expect(item.captureSource).toEqual({
      kind: "email",
      subject: "Re: Antrag auf Verlangerung",
      from: "hans.schmidt@example.de",
    });

    // Verify rawCapture (snippet)
    expect("rawCapture" in item && item.rawCapture).toBe(
      "Sehr geehrte Frau Muller...",
    );
  });

  it("deserializes Person as reference item", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:person:p1",
      "@type": "Person",
      _schemaVersion: 2,
      name: "Steuerberater Schmidt",
      description: "Kontaktperson",
      keywords: [],
      dateCreated: "2026-02-11T09:30:00Z",
      dateModified: "2026-02-11T09:30:00Z",
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "app:bucket",
          value: "reference",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:orgRef",
          value: '{"id":"org-nueva","name":"Nueva Tierra"}',
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:projectRefs",
          value: ["urn:app:project:p1"],
        },
      ],
    });

    const item = fromJsonLd(record) as ReferenceMaterial;
    expect(item.bucket).toBe("reference");
    expect(item.name).toBe("Steuerberater Schmidt");
    expect(item.orgRef).toEqual({ id: "org-nueva", name: "Nueva Tierra" });
    expect(item.projectIds).toEqual(["urn:app:project:p1"]);
  });

  it("deserializes EmailMessage without captureSource using sender fallback", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:email:def456",
      "@type": "EmailMessage",
      _schemaVersion: 2,
      name: "Meeting notes",
      description: null,
      keywords: [],
      dateCreated: "2026-02-11T09:30:00Z",
      dateModified: "2026-02-11T09:30:00Z",
      sender: {
        "@type": "Person",
        email: "colleague@example.de",
      },
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:isFocused",
          value: false,
        },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
      ],
    });

    const item = fromJsonLd(record);
    expect(item.bucket).toBe("inbox");
    // Should fall back to email captureSource derived from sender
    expect(item.captureSource).toEqual({
      kind: "email",
      subject: "Meeting notes",
      from: "colleague@example.de",
    });
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

  it("includes app:projectRefs when projectId provided", () => {
    const ld = buildNewActionJsonLd("Sub-task", "next", {
      projectId: "urn:app:project:p-1" as CanonicalId,
    });

    expect(ld).not.toHaveProperty("isPartOf");
    expectPropertyValue(ld, "app:projectRefs", ["urn:app:project:p-1"]);
  });

  it("generates unique @id with urn:app:action: prefix", () => {
    const ld1 = buildNewActionJsonLd("First", "next");
    const ld2 = buildNewActionJsonLd("Second", "next");

    expect(ld1["@id"]).not.toBe(ld2["@id"]);
    expect((ld1["@id"] as string).startsWith("urn:app:action:")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildNewProjectJsonLd — v2 format
// ---------------------------------------------------------------------------

describe("buildNewProjectJsonLd", () => {
  it("creates a schema:Project with _schemaVersion 2", () => {
    const ld = buildNewProjectJsonLd("Website Relaunch", "Neue Website live");

    expect(ld["@type"]).toBe("Project");
    expect(ld._schemaVersion).toBe(2);
  });

  it("uses schema.org name property", () => {
    const ld = buildNewProjectJsonLd("Website Relaunch", "Neue Website live");

    expect(ld.name).toBe("Website Relaunch");
  });

  it("stores desiredOutcome as additionalProperty", () => {
    const ld = buildNewProjectJsonLd("Website Relaunch", "Neue Website live");

    expectPropertyValue(ld, "app:desiredOutcome", "Neue Website live");
  });

  it("sets projectStatus to active", () => {
    const ld = buildNewProjectJsonLd("P", "D");

    expectPropertyValue(ld, "app:projectStatus", "active");
  });

  it("does not include hasPart (projects no longer track actions)", () => {
    const ld = buildNewProjectJsonLd("P", "D");

    expect(ld).not.toHaveProperty("hasPart");
  });

  it("sets isFocused to false", () => {
    const ld = buildNewProjectJsonLd("P", "D");

    expectPropertyValue(ld, "app:isFocused", false);
  });

  it("sets confidence to high and needsEnrichment to false", () => {
    const ld = buildNewProjectJsonLd("P", "D");

    expectPropertyValue(ld, "app:confidence", "high");
    expectPropertyValue(ld, "app:needsEnrichment", false);
  });

  it("generates unique @id with urn:app:project: prefix", () => {
    const ld1 = buildNewProjectJsonLd("First", "D1");
    const ld2 = buildNewProjectJsonLd("Second", "D2");

    expect(ld1["@id"]).not.toBe(ld2["@id"]);
    expect((ld1["@id"] as string).startsWith("urn:app:project:")).toBe(true);
  });

  it("includes dateCreated and dateModified", () => {
    const ld = buildNewProjectJsonLd("P", "D");

    expect(typeof ld.dateCreated).toBe("string");
    expect(typeof ld.dateModified).toBe("string");
  });

  it("includes provenance history with created entry", () => {
    const ld = buildNewProjectJsonLd("P", "D");

    const history = getProp(ld, "app:provenanceHistory") as unknown[];
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(expect.objectContaining({ action: "created" }));
  });
});

// ---------------------------------------------------------------------------
// fromJsonLd — name normalization (null, missing, empty, whitespace → undefined)
// ---------------------------------------------------------------------------

describe("fromJsonLd name normalization", () => {
  it("normalizes name: null to undefined", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:inbox:n1",
      "@type": "Action",
      _schemaVersion: 2,
      name: null,
      keywords: [],
      dateCreated: "2025-01-01T00:00:00Z",
      dateModified: "2025-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        {
          "@type": "PropertyValue",
          propertyID: "app:rawCapture",
          value: "buy bananas",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: true,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "low",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: { kind: "thought" },
        },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
      ],
    });
    const item = fromJsonLd(record) as ActionItem;
    expect(item.name).toBeUndefined();
    expect(item.rawCapture).toBe("buy bananas");
  });

  it("normalizes missing name to undefined", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:inbox:n2",
      "@type": "Action",
      _schemaVersion: 2,
      keywords: [],
      dateCreated: "2025-01-01T00:00:00Z",
      dateModified: "2025-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        {
          "@type": "PropertyValue",
          propertyID: "app:rawCapture",
          value: "buy bananas",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: true,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "low",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: { kind: "thought" },
        },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
      ],
    });
    const item = fromJsonLd(record) as ActionItem;
    expect(item.name).toBeUndefined();
  });

  it("normalizes empty string name to undefined", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:inbox:n3",
      "@type": "Action",
      _schemaVersion: 2,
      name: "",
      keywords: [],
      dateCreated: "2025-01-01T00:00:00Z",
      dateModified: "2025-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        {
          "@type": "PropertyValue",
          propertyID: "app:rawCapture",
          value: "buy bananas",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: true,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "low",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: { kind: "thought" },
        },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
      ],
    });
    const item = fromJsonLd(record) as ActionItem;
    expect(item.name).toBeUndefined();
  });

  it("normalizes whitespace-only name to undefined", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:inbox:n4",
      "@type": "Action",
      _schemaVersion: 2,
      name: "   ",
      keywords: [],
      dateCreated: "2025-01-01T00:00:00Z",
      dateModified: "2025-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        {
          "@type": "PropertyValue",
          propertyID: "app:rawCapture",
          value: "buy bananas",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: true,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "low",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: { kind: "thought" },
        },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
      ],
    });
    const item = fromJsonLd(record) as ActionItem;
    expect(item.name).toBeUndefined();
  });

  it("preserves actual name when set", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:inbox:n5",
      "@type": "Action",
      _schemaVersion: 2,
      name: "Weekly Groceries",
      keywords: [],
      dateCreated: "2025-01-01T00:00:00Z",
      dateModified: "2025-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        {
          "@type": "PropertyValue",
          propertyID: "app:rawCapture",
          value: "buy bananas",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: true,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "low",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: { kind: "thought" },
        },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
      ],
    });
    const item = fromJsonLd(record) as ActionItem;
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
    const original = createAction({
      rawCapture: "Wireframes erstellen",
      bucket: "next",
    });
    const ld = toJsonLd(original);

    // Name should be omitted from JSON-LD
    expect(ld).not.toHaveProperty("name");
    expectPropertyValue(ld, "app:rawCapture", "Wireframes erstellen");

    const record = wrapAsItemRecord(ld);
    const restored = fromJsonLd(record) as ActionItem;

    expect(restored.name).toBeUndefined();
    expect(restored.rawCapture).toBe("Wireframes erstellen");
    expect(restored.bucket).toBe("next");
  });

  it("preserves rawCapture-only inbox item through serialization", () => {
    const original = createInboxItem({ rawCapture: "Bananen kaufen" });
    const ld = toJsonLd(original);

    expect(ld).not.toHaveProperty("name");
    expectPropertyValue(ld, "app:rawCapture", "Bananen kaufen");

    const record = wrapAsItemRecord(ld);
    const restored = fromJsonLd(record) as ActionItem;

    expect(restored.name).toBeUndefined();
    expect(restored.rawCapture).toBe("Bananen kaufen");
    expect(restored.bucket).toBe("inbox");
  });
});

// ---------------------------------------------------------------------------
// JSON Schema contract validation
// ---------------------------------------------------------------------------
// These tests validate that the serializer output conforms to the JSON Schema
// served by the backend /schemas API endpoint. If the backend changes its
// Pydantic models, these tests break automatically — catching contract drift.
//
// Requires a running backend. Tests skip gracefully when unreachable.
// ---------------------------------------------------------------------------

describe("JSON Schema contract validation", () => {
  let validators: SchemaValidators;
  let backendUp: boolean;

  beforeAll(async () => {
    backendUp = await isBackendAvailable();
    if (backendUp) {
      validators = await loadValidators();
    }
  });

  beforeEach(() => resetFactoryCounter());

  describe("build* functions produce schema-valid payloads", () => {
    it("buildNewInboxJsonLd → action-item schema (text capture defaults to Action)", ({
      skip,
    }) => {
      if (!backendUp) skip();
      const ld = buildNewInboxJsonLd("Anruf bei Frau Müller");
      const valid = validators.validateActionItem(ld);
      expect(valid, formatErrors(validators.validateActionItem)).toBe(true);
    });

    it("buildNewActionJsonLd → action-item schema", ({ skip }) => {
      if (!backendUp) skip();
      const ld = buildNewActionJsonLd("Wireframes erstellen", "next");
      const valid = validators.validateActionItem(ld);
      expect(valid, formatErrors(validators.validateActionItem)).toBe(true);
    });

    it("buildNewActionJsonLd with projectId → action-item schema", ({
      skip,
    }) => {
      if (!backendUp) skip();
      const ld = buildNewActionJsonLd("Sub-task", "next", {
        projectId: "urn:app:project:p-1" as CanonicalId,
      });
      const valid = validators.validateActionItem(ld);
      expect(valid, formatErrors(validators.validateActionItem)).toBe(true);
    });

    it("buildNewReferenceJsonLd → reference-item schema", ({ skip }) => {
      if (!backendUp) skip();
      const ld = buildNewReferenceJsonLd("SGB III § 159");
      const valid = validators.validateReferenceItem(ld);
      expect(valid, formatErrors(validators.validateReferenceItem)).toBe(true);
    });
  });

  describe("toJsonLd produces schema-valid payloads", () => {
    it("inbox item → action-item schema", ({ skip }) => {
      if (!backendUp) skip();
      const item = createInboxItem({ rawCapture: "Buy milk" });
      const ld = toJsonLd(item);
      const valid = validators.validateActionItem(ld);
      expect(valid, formatErrors(validators.validateActionItem)).toBe(true);
    });

    it("action → action-item schema", ({ skip }) => {
      if (!backendUp) skip();
      const action = createAction({
        rawCapture: "Call dentist",
        bucket: "next",
        isFocused: true,
        dueDate: "2026-06-01",
      });
      const ld = toJsonLd(action);
      const valid = validators.validateActionItem(ld);
      expect(valid, formatErrors(validators.validateActionItem)).toBe(true);
    });

    it("project → project-item schema", ({ skip }) => {
      if (!backendUp) skip();
      const project = createProject({
        name: "Renovate kitchen",
        desiredOutcome: "Modern kitchen",
      });
      const ld = toJsonLd(project);
      const valid = validators.validateProjectItem(ld);
      expect(valid, formatErrors(validators.validateProjectItem)).toBe(true);
    });

    it("reference → reference-item schema", ({ skip }) => {
      if (!backendUp) skip();
      const ref = createReferenceMaterial({
        name: "Tax docs",
        url: "https://example.com",
        encodingFormat: "text/html",
      });
      const ld = toJsonLd(ref);
      const valid = validators.validateReferenceItem(ld);
      expect(valid, formatErrors(validators.validateReferenceItem)).toBe(true);
    });
  });

  describe("patch functions produce schema-valid payloads", () => {
    it("buildTriagePatch → item-patch schema", ({ skip }) => {
      if (!backendUp) skip();
      const item = createInboxItem({ rawCapture: "Buy milk" });
      const patch = buildTriagePatch(item, { targetBucket: "next" });
      const valid = validators.validateItemPatch(patch);
      expect(valid, formatErrors(validators.validateItemPatch)).toBe(true);
    });

    it("buildItemEditPatch → item-patch schema", ({ skip }) => {
      if (!backendUp) skip();
      const patch = buildItemEditPatch({
        dueDate: "2026-06-01",
        contexts: ["@phone"],
        description: "Updated notes",
      });
      const valid = validators.validateItemPatch(patch);
      expect(valid, formatErrors(validators.validateItemPatch)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// fileId / downloadUrl round-trip
// ---------------------------------------------------------------------------

describe("fromJsonLd extracts fileId and downloadUrl", () => {
  it("extracts app:fileId and app:downloadUrl from action item", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:inbox:f1",
      "@type": "DigitalDocument",
      _schemaVersion: 2,
      name: "report.pdf",
      keywords: [],
      encodingFormat: "application/pdf",
      dateCreated: "2026-01-01T00:00:00Z",
      dateModified: "2026-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: {
            kind: "file",
            fileName: "report.pdf",
            mimeType: "application/pdf",
          },
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:fileId",
          value: "file-uuid-123",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:downloadUrl",
          value: "/files/file-uuid-123",
        },
      ],
    });
    const item = fromJsonLd(record);
    expect(item.fileId).toBe("file-uuid-123");
    expect(item.downloadUrl).toBe("/files/file-uuid-123");
  });

  it("extracts file fields from reference material", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:reference:f2",
      "@type": "CreativeWork",
      _schemaVersion: 2,
      name: "style-guide.pdf",
      keywords: [],
      encodingFormat: "application/pdf",
      dateCreated: "2026-01-01T00:00:00Z",
      dateModified: "2026-01-01T00:00:00Z",
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "app:bucket",
          value: "reference",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:fileId",
          value: "file-uuid-456",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:downloadUrl",
          value: "/files/file-uuid-456",
        },
      ],
    });
    const item = fromJsonLd(record);
    expect(item.fileId).toBe("file-uuid-456");
    expect(item.downloadUrl).toBe("/files/file-uuid-456");
  });

  it("returns undefined when file fields are absent", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:inbox:f3",
      "@type": "Action",
      _schemaVersion: 2,
      keywords: [],
      dateCreated: "2026-01-01T00:00:00Z",
      dateModified: "2026-01-01T00:00:00Z",
      additionalProperty: [
        { "@type": "PropertyValue", propertyID: "app:bucket", value: "inbox" },
      ],
    });
    const item = fromJsonLd(record);
    expect(item.fileId).toBeUndefined();
    expect(item.downloadUrl).toBeUndefined();
  });
});

describe("toJsonLd serializes fileId and downloadUrl", () => {
  beforeEach(() => resetFactoryCounter());

  it("includes file fields for action item with fileId", () => {
    const action = createAction({
      name: "Uploaded doc",
      bucket: "next",
      fileId: "file-uuid-789",
      downloadUrl: "/files/file-uuid-789",
    });
    const ld = toJsonLd(action);
    expectPropertyValue(ld, "app:fileId", "file-uuid-789");
    expectPropertyValue(ld, "app:downloadUrl", "/files/file-uuid-789");
  });

  it("omits file fields when absent", () => {
    const action = createAction({ name: "Plain action", bucket: "next" });
    const ld = toJsonLd(action);
    expect(getProp(ld, "app:fileId")).toBeUndefined();
    expect(getProp(ld, "app:downloadUrl")).toBeUndefined();
  });

  it("includes file fields for reference material with fileId", () => {
    const ref = createReferenceMaterial({
      name: "Ref with file",
      fileId: "file-uuid-ref",
      downloadUrl: "/files/file-uuid-ref",
    });
    const ld = toJsonLd(ref);
    expectPropertyValue(ld, "app:fileId", "file-uuid-ref");
    expectPropertyValue(ld, "app:downloadUrl", "/files/file-uuid-ref");
  });
});

// ---------------------------------------------------------------------------
// ReadAction support
// ---------------------------------------------------------------------------

describe("ReadAction support", () => {
  beforeEach(() => resetFactoryCounter());

  it("fromJsonLd handles ReadAction with object ref", () => {
    const record = wrapAsItemRecord({
      "@type": "ReadAction",
      "@id": "urn:app:action:read1",
      _schemaVersion: 2,
      name: "Read report",
      keywords: [],
      dateCreated: "2026-01-01T00:00:00Z",
      dateModified: "2026-01-01T00:00:00Z",
      startTime: null,
      endTime: null,
      object: { "@id": "urn:app:reference:doc1" },
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "app:bucket",
          value: "next",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: false,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "high",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: { kind: "file", fileName: "report.pdf" },
        },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:isFocused",
          value: false,
        },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
      ],
    });
    const item = fromJsonLd(record) as ActionItem;
    expect(item.bucket).toBe("next");
    expect(item.objectRef).toBe("urn:app:reference:doc1");
    expect(item.name).toBe("Read report");
  });

  it("fromJsonLd Action without object has objectRef undefined", () => {
    const record = wrapAsItemRecord({
      "@type": "Action",
      "@id": "urn:app:action:plain1",
      _schemaVersion: 2,
      name: "Buy milk",
      keywords: [],
      dateCreated: "2026-01-01T00:00:00Z",
      dateModified: "2026-01-01T00:00:00Z",
      startTime: null,
      endTime: null,
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "app:bucket",
          value: "next",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:needsEnrichment",
          value: false,
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:confidence",
          value: "high",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:captureSource",
          value: { kind: "thought" },
        },
        { "@type": "PropertyValue", propertyID: "app:contexts", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:isFocused",
          value: false,
        },
        { "@type": "PropertyValue", propertyID: "app:ports", value: [] },
        {
          "@type": "PropertyValue",
          propertyID: "app:typedReferences",
          value: [],
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:provenanceHistory",
          value: [],
        },
      ],
    });
    const item = fromJsonLd(record) as ActionItem;
    expect(item.objectRef).toBeUndefined();
  });

  it("toJsonLd emits ReadAction and object when objectRef set", () => {
    const action = createAction({
      name: "Read report",
      bucket: "next",
      objectRef: "urn:app:reference:doc1" as CanonicalId,
    });
    const ld = toJsonLd(action);
    expect(ld["@type"]).toBe("ReadAction");
    expect(ld.object).toEqual({ "@id": "urn:app:reference:doc1" });
  });

  it("toJsonLd emits Action without object when objectRef absent", () => {
    const action = createAction({ name: "Buy milk", bucket: "next" });
    const ld = toJsonLd(action);
    expect(ld["@type"]).toBe("Action");
    expect(ld.object).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildNewFileReferenceJsonLd
// ---------------------------------------------------------------------------

describe("buildNewFileReferenceJsonLd", () => {
  it("creates DigitalDocument reference with splitFrom provenance", async () => {
    const { buildNewFileReferenceJsonLd } = await import("./item-serializer");
    resetFactoryCounter();

    const sourceItem = createAction({
      name: "Presupuesto.pdf",
      bucket: "inbox",
      fileId: "file-123",
      downloadUrl: "/files/file-123",
      captureSource: {
        kind: "file",
        fileName: "Presupuesto.pdf",
        mimeType: "application/pdf",
      },
    });

    const sourceRecord = wrapAsItemRecord({
      "@type": "DigitalDocument",
      "@id": sourceItem.id,
      _schemaVersion: 2,
      name: "Presupuesto.pdf",
      encodingFormat: "application/pdf",
      dateCreated: "2026-01-01T00:00:00Z",
      dateModified: "2026-01-01T00:00:00Z",
    });

    const ld = buildNewFileReferenceJsonLd(sourceItem, sourceRecord);
    expect(ld["@type"]).toBe("DigitalDocument");
    expect(ld["@id"]).toMatch(/^urn:app:reference:/);
    expect(ld.encodingFormat).toBe("application/pdf");
    expect(ld.name).toBe("Presupuesto.pdf");
    expectPropertyValue(ld, "app:bucket", "reference");
    expectPropertyValue(ld, "app:origin", "triaged");
    expectPropertyValue(ld, "app:confidence", "high");
    expectPropertyValue(ld, "app:fileId", "file-123");
    expectPropertyValue(ld, "app:downloadUrl", "/files/file-123");

    const history = getProp(ld, "app:provenanceHistory") as Array<{
      timestamp: string;
      action: string;
      splitFrom?: string;
    }>;
    expect(history).toHaveLength(1);
    expect(history[0]?.action).toBe("created");
    expect(history[0]?.splitFrom).toBe(sourceItem.id);
  });
});

// ---------------------------------------------------------------------------
// buildReadActionTriagePatch
// ---------------------------------------------------------------------------

describe("buildReadActionTriagePatch", () => {
  it("creates ReadAction patch with object ref", async () => {
    const { buildReadActionTriagePatch } = await import("./item-serializer");
    resetFactoryCounter();

    const item = createAction({
      name: "Presupuesto.pdf",
      bucket: "inbox",
      fileId: "file-123",
      downloadUrl: "/files/file-123",
    });

    const refId = "urn:app:reference:doc1" as CanonicalId;
    const patch = buildReadActionTriagePatch(
      item,
      { targetBucket: "next" },
      refId,
    );

    expect(patch["@type"]).toBe("ReadAction");
    expect(patch.object).toEqual({ "@id": refId });
    expectPropertyValue(patch, "app:bucket", "next");
    // File-specific props cleared
    expectPropertyValue(patch, "app:fileId", null);
    expectPropertyValue(patch, "app:downloadUrl", null);
  });
});

// ---------------------------------------------------------------------------
// Reference projectIds round-trip
// ---------------------------------------------------------------------------

describe("reference projectIds", () => {
  beforeEach(() => resetFactoryCounter());

  const PROJECT_ID = "urn:copilot:project:tax2025" as CanonicalId;

  it("fromJsonLd extracts projectIds from CreativeWork reference", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:reference:r1",
      "@type": "CreativeWork",
      _schemaVersion: 2,
      name: "W-2 Form.pdf",
      keywords: [],
      dateCreated: "2026-01-01T00:00:00Z",
      dateModified: "2026-01-01T00:00:00Z",
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "app:bucket",
          value: "reference",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:projectRefs",
          value: [PROJECT_ID],
        },
      ],
    });
    const item = fromJsonLd(record) as ReferenceMaterial;
    expect(item.bucket).toBe("reference");
    expect(item.projectIds).toEqual([PROJECT_ID]);
  });

  it("fromJsonLd extracts projectIds from DigitalDocument reference", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:reference:r2",
      "@type": "DigitalDocument",
      _schemaVersion: 2,
      name: "1099-INT.pdf",
      keywords: [],
      encodingFormat: "application/pdf",
      dateCreated: "2026-01-01T00:00:00Z",
      dateModified: "2026-01-01T00:00:00Z",
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "app:bucket",
          value: "reference",
        },
        {
          "@type": "PropertyValue",
          propertyID: "app:projectRefs",
          value: [PROJECT_ID],
        },
      ],
    });
    const item = fromJsonLd(record) as ReferenceMaterial;
    expect(item.bucket).toBe("reference");
    expect(item.projectIds).toEqual([PROJECT_ID]);
  });

  it("fromJsonLd defaults projectIds to empty array", () => {
    const record = wrapAsItemRecord({
      "@id": "urn:app:reference:r3",
      "@type": "CreativeWork",
      _schemaVersion: 2,
      name: "Unlinked doc",
      keywords: [],
      dateCreated: "2026-01-01T00:00:00Z",
      dateModified: "2026-01-01T00:00:00Z",
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "app:bucket",
          value: "reference",
        },
      ],
    });
    const item = fromJsonLd(record) as ReferenceMaterial;
    expect(item.projectIds).toEqual([]);
  });

  it("toJsonLd serializes projectIds for reference material", () => {
    const ref = createReferenceMaterial({
      name: "W-2 Form.pdf",
      projectId: PROJECT_ID,
    });
    const ld = toJsonLd(ref);
    expectPropertyValue(ld, "app:projectRefs", [PROJECT_ID]);
  });

  it("toJsonLd omits projectRefs when empty", () => {
    const ref = createReferenceMaterial({ name: "Orphan doc" });
    const ld = toJsonLd(ref);
    expect(getProp(ld, "app:projectRefs")).toBeUndefined();
  });

  it("buildNewFileReferenceJsonLd propagates sourceItem projectIds", async () => {
    const { buildNewFileReferenceJsonLd } = await import("./item-serializer");
    resetFactoryCounter();

    const sourceItem = createAction({
      name: "W-2.pdf",
      bucket: "inbox",
      projectId: PROJECT_ID,
      fileId: "file-w2",
      downloadUrl: "/files/file-w2",
      captureSource: {
        kind: "file",
        fileName: "W-2.pdf",
        mimeType: "application/pdf",
      },
    });

    const sourceRecord = wrapAsItemRecord({
      "@type": "DigitalDocument",
      "@id": sourceItem.id,
      _schemaVersion: 2,
      name: "W-2.pdf",
      encodingFormat: "application/pdf",
      dateCreated: "2026-01-01T00:00:00Z",
      dateModified: "2026-01-01T00:00:00Z",
    });

    const ld = buildNewFileReferenceJsonLd(sourceItem, sourceRecord);
    expectPropertyValue(ld, "app:projectRefs", [PROJECT_ID]);
  });

  it("buildNewReferenceJsonLd includes projectRefs when provided", () => {
    const ld = buildNewReferenceJsonLd("Tax Receipt", {
      projectId: PROJECT_ID,
    });
    expectPropertyValue(ld, "app:projectRefs", [PROJECT_ID]);
  });

  it("buildNewReferenceJsonLd defaults projectRefs to empty", () => {
    const ld = buildNewReferenceJsonLd("Random Note");
    expectPropertyValue(ld, "app:projectRefs", []);
  });
});
