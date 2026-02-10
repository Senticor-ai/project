import { describe, it, expect, beforeEach } from "vitest";
import {
  isInboxItem,
  isAction,
  isProject,
  isReferenceMaterial,
  getDisplayName,
} from "../types";
import type { AppItem, TriageResult } from "../types";
import {
  createThing,
  createInboxItem,
  createAction,
  createProject,
  createReferenceMaterial,
  createContext,
  createTypedReference,
  definitionPort,
  predicatePort,
  computationPort,
  procedurePort,
  resetFactoryCounter,
} from "../factories";
import { createCanonicalId } from "../canonical-id";

beforeEach(() => {
  resetFactoryCounter();
});

describe("InboxItem", () => {
  it("creates with default values", () => {
    const item = createInboxItem({ name: "Anruf bei Frau Müller" });
    expect(item.bucket).toBe("inbox");
    expect(item.name).toBe("Anruf bei Frau Müller");
    expect(item.rawCapture).toBe("Anruf bei Frau Müller");
    expect(item.needsEnrichment).toBe(true);
    expect(item.confidence).toBe("medium");
    expect(item.id).toMatch(/^urn:app:inbox:/);
  });

  it("creates with rawCapture only (no name)", () => {
    const item = createInboxItem({ rawCapture: "Bananen kaufen" });
    expect(item.bucket).toBe("inbox");
    expect(item.name).toBeUndefined();
    expect(item.rawCapture).toBe("Bananen kaufen");
    expect(getDisplayName(item)).toBe("Bananen kaufen");
  });

  it("records capture source", () => {
    const item = createInboxItem({
      name: "Follow-up from meeting",
      captureSource: {
        kind: "meeting",
        title: "Teamrunde",
        date: "2025-11-09",
      },
    });
    expect(item.captureSource.kind).toBe("meeting");
  });

  it("throws when neither name nor rawCapture is provided", () => {
    expect(() =>
      createThing({ bucket: "inbox" } as Parameters<typeof createThing>[0]),
    ).toThrow();
  });

  it("has provenance with created entry", () => {
    const item = createInboxItem({ name: "Test" });
    expect(item.provenance.history).toHaveLength(1);
    expect(item.provenance.history[0]?.action).toBe("created");
  });
});

describe("Action", () => {
  it("creates a next action", () => {
    const action = createAction({
      name: "Wireframes erstellen",
      bucket: "next",
    });
    expect(action.bucket).toBe("next");
    expect(action.isFocused).toBe(false);
    expect(action.needsEnrichment).toBe(false);
    expect(action.confidence).toBe("high");
  });

  it("creates an action with rawCapture only (no name)", () => {
    const action = createAction({
      rawCapture: "Wireframes erstellen",
      bucket: "next",
    });
    expect(action.bucket).toBe("next");
    expect(action.name).toBeUndefined();
    expect(action.rawCapture).toBe("Wireframes erstellen");
    expect(getDisplayName(action)).toBe("Wireframes erstellen");
  });

  it("creates a waiting-for action", () => {
    const action = createAction({
      name: "Feedback von Sarah",
      bucket: "waiting",
      delegatedTo: "Sarah",
    });
    expect(action.bucket).toBe("waiting");
    expect(action.delegatedTo).toBe("Sarah");
  });

  it("supports contexts", () => {
    const ctx = createContext({ name: "@computer" });
    const action = createAction({
      name: "Deploy to staging",
      contexts: [ctx.id],
    });
    expect(action.contexts).toHaveLength(1);
    expect(action.contexts[0]).toBe(ctx.id);
  });

  it("supports recurrence", () => {
    const action = createAction({
      name: "Wochenbericht",
      recurrence: { kind: "weekly", interval: 1, daysOfWeek: [5] },
    });
    expect(action.recurrence?.kind).toBe("weekly");
  });

  it("supports sequence order for project sub-actions", () => {
    const action = createAction({
      name: "Step 2",
      sequenceOrder: 2,
      projectId: createCanonicalId("project", "proj-1"),
    });
    expect(action.sequenceOrder).toBe(2);
    expect(action.projectIds).toEqual(["urn:app:project:proj-1"]);
  });
});

describe("Project", () => {
  it("creates with desired outcome", () => {
    const project = createProject({
      name: "Website Relaunch",
      desiredOutcome: "Neue Website live und von Stakeholdern abgenommen",
    });
    expect(project.bucket).toBe("project");
    expect(project.status).toBe("active");
    expect(project.desiredOutcome).toContain("Stakeholdern");
  });

  it("creates project without actionIds (actions reference projects, not vice versa)", () => {
    const project = createProject({
      name: "Build feature",
      desiredOutcome: "Feature shipped",
    });
    expect(project).not.toHaveProperty("actionIds");
    expect(project.status).toBe("active");
  });
});

describe("ReferenceMaterial", () => {
  it("creates reference with URL", () => {
    const ref = createReferenceMaterial({
      name: "SGB III § 159",
      url: "https://www.gesetze-im-internet.de/sgb_3/__159.html",
      encodingFormat: "text/html",
    });
    expect(ref.bucket).toBe("reference");
    expect(ref.url).toContain("sgb_3");
  });
});

describe("Type Guards", () => {
  it("identifies inbox items", () => {
    const item: AppItem = createInboxItem({ name: "Test" });
    expect(isInboxItem(item)).toBe(true);
    expect(isAction(item)).toBe(false);
    expect(isProject(item)).toBe(false);
  });

  it("identifies actions", () => {
    const item: AppItem = createAction({ name: "Test" });
    expect(isAction(item)).toBe(true);
    expect(isInboxItem(item)).toBe(false);
  });

  it("identifies projects", () => {
    const item: AppItem = createProject({
      name: "Test",
      desiredOutcome: "Done",
    });
    expect(isProject(item)).toBe(true);
    expect(isAction(item)).toBe(false);
  });

  it("identifies reference material", () => {
    const item: AppItem = createReferenceMaterial({ name: "Test" });
    expect(isReferenceMaterial(item)).toBe(true);
    expect(isAction(item)).toBe(false);
  });
});

describe("TriageResult", () => {
  it("represents a simple bucket move", () => {
    const result: TriageResult = { targetBucket: "next" };
    expect(result.targetBucket).toBe("next");
    expect(result.projectId).toBeUndefined();
  });

  it("represents a move with project assignment", () => {
    const projId = createCanonicalId("project", "proj-1");
    const result: TriageResult = {
      targetBucket: "next",
      projectId: projId,
    };
    expect(result.targetBucket).toBe("next");
    expect(result.projectId).toBe("urn:app:project:proj-1");
  });

  it("represents a move with date and contexts", () => {
    const result: TriageResult = {
      targetBucket: "calendar",
      date: "2026-02-10",
      contexts: ["@office"],
    };
    expect(result.targetBucket).toBe("calendar");
    expect(result.date).toBe("2026-02-10");
    expect(result.contexts).toEqual(["@office"]);
  });

  it("represents archive", () => {
    const result: TriageResult = { targetBucket: "archive" };
    expect(result.targetBucket).toBe("archive");
  });
});

describe("getDisplayName", () => {
  it("returns name when set", () => {
    const item = createInboxItem({ name: "Einkaufen" });
    expect(getDisplayName(item)).toBe("Einkaufen");
  });

  it("returns rawCapture when name is undefined", () => {
    const item = createThing({
      name: "placeholder",
      bucket: "inbox",
      rawCapture: "buy bananas",
    });
    // Simulate name being unset (will be the real case after name becomes optional)
    const unnamed = { ...item, name: undefined };
    expect(getDisplayName(unnamed as AppItem)).toBe("buy bananas");
  });

  it("prefers name over rawCapture when both are set", () => {
    const item = createThing({
      name: "Weekly Groceries",
      bucket: "inbox",
      rawCapture: "buy bananas",
    });
    expect(getDisplayName(item)).toBe("Weekly Groceries");
  });

  it("returns 'Untitled' when neither name nor rawCapture exists", () => {
    const item = createProject({
      name: "placeholder",
      desiredOutcome: "done",
    });
    const unnamed = { ...item, name: undefined };
    expect(getDisplayName(unnamed as AppItem)).toBe("Untitled");
  });
});

describe("Typed References", () => {
  it("creates a blocks reference", () => {
    const target = createAction({ name: "Start development" });
    const ref = createTypedReference({
      type: "blocks",
      targetId: target.id,
      note: "Cannot start dev without approval",
    });
    expect(ref.type).toBe("blocks");
    expect(ref.targetId).toBe(target.id);

    const blocker = createAction({
      name: "Get approval",
      references: [ref],
    });
    expect(blocker.references).toHaveLength(1);
    expect(blocker.references[0]?.type).toBe("blocks");
  });
});

describe("Ports", () => {
  it("creates a definition port", () => {
    const port = definitionPort("Homepage wireframes approved by team");
    expect(port.kind).toBe("definition");
  });

  it("creates a procedure port with checklist", () => {
    const port = procedurePort([
      { text: "Header component", completed: true },
      { text: "Navigation", completed: false },
      { text: "Hero section" },
    ]);
    expect(port.kind).toBe("procedure");
    if (port.kind === "procedure") {
      expect(port.steps).toHaveLength(3);
      expect(port.steps[0]?.completed).toBe(true);
      expect(port.steps[1]?.completed).toBe(false);
      expect(port.steps[2]?.completed).toBe(false);
    }
  });

  it("creates a predicate port with conditions", () => {
    const port = predicatePort(["Budget approved", "Team available"]);
    expect(port.kind).toBe("predicate");
    if (port.kind === "predicate") {
      expect(port.conditions).toEqual(["Budget approved", "Team available"]);
    }
  });

  it("creates a computation port with defaults", () => {
    const port = computationPort();
    expect(port.kind).toBe("computation");
  });

  it("creates a computation port with time and energy", () => {
    const port = computationPort({
      timeEstimate: "2h",
      energyLevel: "high",
    });
    expect(port.kind).toBe("computation");
    if (port.kind === "computation") {
      expect(port.timeEstimate).toBe("2h");
      expect(port.energyLevel).toBe("high");
    }
  });

  it("attaches ports to an action", () => {
    const action = createAction({
      name: "Design homepage",
      ports: [
        definitionPort("Wireframes approved"),
        procedurePort([{ text: "Header" }, { text: "Footer" }]),
      ],
    });
    expect(action.ports).toHaveLength(2);
    expect(action.ports[0]?.kind).toBe("definition");
    expect(action.ports[1]?.kind).toBe("procedure");
  });
});
