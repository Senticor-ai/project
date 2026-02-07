import { describe, it, expect, beforeEach } from "vitest";
import {
  isInboxItem,
  isAction,
  isProject,
  isReferenceMaterial,
} from "../gtd-types";
import type { GtdItem, TriageResult } from "../gtd-types";
import {
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
    const item = createInboxItem({ title: "Anruf bei Frau Müller" });
    expect(item.bucket).toBe("inbox");
    expect(item.title).toBe("Anruf bei Frau Müller");
    expect(item.rawCapture).toBe("Anruf bei Frau Müller");
    expect(item.needsEnrichment).toBe(true);
    expect(item.confidence).toBe("low");
    expect(item.id).toMatch(/^urn:gtd:inbox:/);
  });

  it("records capture source", () => {
    const item = createInboxItem({
      title: "Follow-up from meeting",
      captureSource: {
        kind: "meeting",
        title: "Teamrunde",
        date: "2025-11-09",
      },
    });
    expect(item.captureSource.kind).toBe("meeting");
  });

  it("has provenance with created entry", () => {
    const item = createInboxItem({ title: "Test" });
    expect(item.provenance.history).toHaveLength(1);
    expect(item.provenance.history[0]?.action).toBe("created");
  });
});

describe("Action", () => {
  it("creates a next action", () => {
    const action = createAction({
      title: "Wireframes erstellen",
      bucket: "next",
    });
    expect(action.bucket).toBe("next");
    expect(action.isFocused).toBe(false);
    expect(action.needsEnrichment).toBe(false);
    expect(action.confidence).toBe("high");
  });

  it("creates a waiting-for action", () => {
    const action = createAction({
      title: "Feedback von Sarah",
      bucket: "waiting",
      delegatedTo: "Sarah",
    });
    expect(action.bucket).toBe("waiting");
    expect(action.delegatedTo).toBe("Sarah");
  });

  it("supports contexts", () => {
    const ctx = createContext({ name: "@computer" });
    const action = createAction({
      title: "Deploy to staging",
      contexts: [ctx.id],
    });
    expect(action.contexts).toHaveLength(1);
    expect(action.contexts[0]).toBe(ctx.id);
  });

  it("supports recurrence", () => {
    const action = createAction({
      title: "Wochenbericht",
      recurrence: { kind: "weekly", interval: 1, daysOfWeek: [5] },
    });
    expect(action.recurrence?.kind).toBe("weekly");
  });

  it("supports sequence order for project sub-actions", () => {
    const action = createAction({
      title: "Step 2",
      sequenceOrder: 2,
      projectId: createCanonicalId("project", "proj-1"),
    });
    expect(action.sequenceOrder).toBe(2);
    expect(action.projectId).toBe("urn:gtd:project:proj-1");
  });
});

describe("Project", () => {
  it("creates with desired outcome", () => {
    const project = createProject({
      title: "Website Relaunch",
      desiredOutcome: "Neue Website live und von Stakeholdern abgenommen",
    });
    expect(project.bucket).toBe("project");
    expect(project.status).toBe("active");
    expect(project.desiredOutcome).toContain("Stakeholdern");
  });

  it("supports action ordering", () => {
    const a1 = createAction({ title: "Design", sequenceOrder: 1 });
    const a2 = createAction({ title: "Develop", sequenceOrder: 2 });
    const project = createProject({
      title: "Build feature",
      desiredOutcome: "Feature shipped",
      actionIds: [a1.id, a2.id],
    });
    expect(project.actionIds).toHaveLength(2);
  });
});

describe("ReferenceMaterial", () => {
  it("creates reference with URL", () => {
    const ref = createReferenceMaterial({
      title: "SGB III § 159",
      externalUrl: "https://www.gesetze-im-internet.de/sgb_3/__159.html",
      contentType: "text/html",
    });
    expect(ref.bucket).toBe("reference");
    expect(ref.externalUrl).toContain("sgb_3");
  });
});

describe("Type Guards", () => {
  it("identifies inbox items", () => {
    const item: GtdItem = createInboxItem({ title: "Test" });
    expect(isInboxItem(item)).toBe(true);
    expect(isAction(item)).toBe(false);
    expect(isProject(item)).toBe(false);
  });

  it("identifies actions", () => {
    const item: GtdItem = createAction({ title: "Test" });
    expect(isAction(item)).toBe(true);
    expect(isInboxItem(item)).toBe(false);
  });

  it("identifies projects", () => {
    const item: GtdItem = createProject({
      title: "Test",
      desiredOutcome: "Done",
    });
    expect(isProject(item)).toBe(true);
    expect(isAction(item)).toBe(false);
  });

  it("identifies reference material", () => {
    const item: GtdItem = createReferenceMaterial({ title: "Test" });
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
    expect(result.projectId).toBe("urn:gtd:project:proj-1");
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

describe("Typed References", () => {
  it("creates a blocks reference", () => {
    const target = createAction({ title: "Start development" });
    const ref = createTypedReference({
      type: "blocks",
      targetId: target.id,
      note: "Cannot start dev without approval",
    });
    expect(ref.type).toBe("blocks");
    expect(ref.targetId).toBe(target.id);

    const blocker = createAction({
      title: "Get approval",
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
      title: "Design homepage",
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
