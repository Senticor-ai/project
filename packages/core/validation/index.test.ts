import { describe, expect, it } from "vitest";

import { buildCreateItemJsonLd } from "../serializers/jsonld.js";
import {
  celRuleCount,
  validateCreateItem,
  validateTriageTransition,
} from "./index.js";

describe("validation assets", () => {
  it("loads CEL rule definitions", () => {
    expect(celRuleCount()).toBeGreaterThanOrEqual(3);
  });
});

describe("validateCreateItem", () => {
  it("accepts a valid Action payload", () => {
    const item = buildCreateItemJsonLd({
      type: "Action",
      name: "File taxes",
      bucket: "next",
      orgId: "org-1",
    });

    expect(validateCreateItem(item)).toEqual([]);
  });

  it("rejects invalid action bucket", () => {
    const item = buildCreateItemJsonLd({
      type: "Action",
      name: "File taxes",
      bucket: "invalid",
      orgId: "org-1",
    });

    const issues = validateCreateItem(item);
    expect(issues.some((issue) => issue.code === "ACTION_BUCKET_INVALID")).toBe(true);
  });

  it("rejects Person without org metadata", () => {
    const item = buildCreateItemJsonLd({
      type: "Person",
      name: "Test Person",
      orgId: "org-1",
      orgRole: "member",
    });

    const issues = validateCreateItem(item);
    expect(issues.some((issue) => issue.code === "PERSON_ORGREF_REQUIRED")).toBe(true);
  });
});

describe("validateTriageTransition", () => {
  it("allows inbox to next", () => {
    expect(
      validateTriageTransition({
        sourceBucket: "inbox",
        targetBucket: "next",
      }),
    ).toEqual([]);
  });

  it("blocks inbox to completed", () => {
    const issues = validateTriageTransition({
      sourceBucket: "inbox",
      targetBucket: "completed",
    });
    expect(issues.some((issue) => issue.code === "TRIAGE_INBOX_TARGET_INVALID")).toBe(true);
  });
});
