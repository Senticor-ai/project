import { describe, expect, it } from "vitest";

import { evaluateCelRules } from "./evaluator.js";

describe("evaluateCelRules", () => {
  describe("triage.inbox.targets rule", () => {
    it("allows inbox to next", () => {
      const issues = evaluateCelRules({
        source: { bucket: "inbox" },
        target: { bucket: "next" },
      });

      expect(issues).toEqual([]);
    });

    it("allows inbox to waiting", () => {
      const issues = evaluateCelRules({
        source: { bucket: "inbox" },
        target: { bucket: "waiting" },
      });

      expect(issues).toEqual([]);
    });

    it("allows inbox to someday", () => {
      const issues = evaluateCelRules({
        source: { bucket: "inbox" },
        target: { bucket: "someday" },
      });

      expect(issues).toEqual([]);
    });

    it("allows inbox to calendar", () => {
      const issues = evaluateCelRules({
        source: { bucket: "inbox" },
        target: { bucket: "calendar" },
      });

      expect(issues).toEqual([]);
    });

    it("allows inbox to reference", () => {
      const issues = evaluateCelRules({
        source: { bucket: "inbox" },
        target: { bucket: "reference" },
      });

      expect(issues).toEqual([]);
    });

    it("blocks inbox to completed", () => {
      const issues = evaluateCelRules({
        source: { bucket: "inbox" },
        target: { bucket: "completed" },
      });

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        source: "cel",
        code: "TRIAGE_INBOX_TARGET_INVALID",
        message: "Inbox items can only move to next,waiting,someday,calendar,reference.",
        field: "bucket",
        rule: "triage.inbox.targets",
      });
    });

    it("blocks inbox to project", () => {
      const issues = evaluateCelRules({
        source: { bucket: "inbox" },
        target: { bucket: "project" },
      });

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe("TRIAGE_INBOX_TARGET_INVALID");
    });

    it("does not apply when source is not inbox", () => {
      const issues = evaluateCelRules({
        source: { bucket: "next" },
        target: { bucket: "completed" },
      });

      expect(issues.some((issue) => issue.code === "TRIAGE_INBOX_TARGET_INVALID")).toBe(false);
    });
  });

  describe("item.completed.immutable rule", () => {
    it("allows read operations on completed items", () => {
      const issues = evaluateCelRules({
        operation: "read",
        source: { bucket: "completed" },
      });

      expect(issues.some((issue) => issue.code === "COMPLETED_IMMUTABLE")).toBe(false);
    });

    it("blocks update operations on completed items", () => {
      const issues = evaluateCelRules({
        operation: "update",
        source: { bucket: "completed" },
      });

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        source: "cel",
        code: "COMPLETED_IMMUTABLE",
        message: "Completed items are immutable.",
        field: "bucket",
        rule: "item.completed.immutable",
      });
    });

    it("blocks delete operations on completed items", () => {
      const issues = evaluateCelRules({
        operation: "delete",
        source: { bucket: "completed" },
      });

      expect(issues.some((issue) => issue.code === "COMPLETED_IMMUTABLE")).toBe(true);
    });

    it("does not apply when source is not completed", () => {
      const issues = evaluateCelRules({
        operation: "update",
        source: { bucket: "next" },
      });

      expect(issues.some((issue) => issue.code === "COMPLETED_IMMUTABLE")).toBe(false);
    });
  });

  describe("item.bucket.enum rule", () => {
    it("accepts valid bucket on create", () => {
      const issues = evaluateCelRules({
        operation: "create",
        bucket: "inbox",
      });

      expect(issues.some((issue) => issue.code === "BUCKET_ENUM")).toBe(false);
    });

    it("accepts valid bucket on triage", () => {
      const issues = evaluateCelRules({
        operation: "triage",
        bucket: "next",
      });

      expect(issues.some((issue) => issue.code === "BUCKET_ENUM")).toBe(false);
    });

    it("accepts all valid bucket values", () => {
      const validBuckets = [
        "inbox",
        "next",
        "waiting",
        "someday",
        "calendar",
        "reference",
        "project",
        "completed",
      ];

      for (const bucket of validBuckets) {
        const issues = evaluateCelRules({
          operation: "create",
          bucket,
        });

        expect(issues.some((issue) => issue.code === "BUCKET_ENUM")).toBe(false);
      }
    });

    it("rejects invalid bucket on create", () => {
      const issues = evaluateCelRules({
        operation: "create",
        bucket: "invalid",
      });

      expect(issues.some((issue) => issue.code === "BUCKET_ENUM")).toBe(true);
      const bucketIssue = issues.find((issue) => issue.code === "BUCKET_ENUM");
      expect(bucketIssue).toMatchObject({
        source: "cel",
        code: "BUCKET_ENUM",
        message: "Bucket must be one of inbox,next,waiting,someday,calendar,reference,project,completed.",
        field: "additionalProperty.app:bucket",
        rule: "item.bucket.enum",
      });
    });

    it("rejects invalid bucket on triage", () => {
      const issues = evaluateCelRules({
        operation: "triage",
        bucket: "unknown",
      });

      expect(issues.some((issue) => issue.code === "BUCKET_ENUM")).toBe(true);
    });

    it("does not apply when operation is not create or triage", () => {
      const issues = evaluateCelRules({
        operation: "read",
        bucket: "invalid",
      });

      expect(issues.some((issue) => issue.code === "BUCKET_ENUM")).toBe(false);
    });
  });

  describe("multiple rule violations", () => {
    it("returns multiple issues when multiple rules fail", () => {
      const issues = evaluateCelRules({
        operation: "create",
        bucket: "invalid",
        source: { bucket: "inbox" },
        target: { bucket: "completed" },
      });

      expect(issues.length).toBeGreaterThan(1);
      expect(issues.some((issue) => issue.code === "BUCKET_ENUM")).toBe(true);
      expect(issues.some((issue) => issue.code === "TRIAGE_INBOX_TARGET_INVALID")).toBe(true);
    });
  });

  describe("error handling", () => {
    it("handles missing context variables gracefully", () => {
      const issues = evaluateCelRules({
        // Missing expected variables
      });

      // Should either return issues or handle gracefully
      expect(Array.isArray(issues)).toBe(true);
    });

    it("handles undefined values in context", () => {
      const issues = evaluateCelRules({
        operation: "create",
        bucket: undefined,
      });

      expect(Array.isArray(issues)).toBe(true);
    });

    it("handles null values in context", () => {
      const issues = evaluateCelRules({
        operation: "create",
        bucket: null,
      });

      expect(Array.isArray(issues)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns empty array when all rules pass", () => {
      const issues = evaluateCelRules({
        operation: "read",
        bucket: "inbox",
      });

      expect(issues).toEqual([]);
    });

    it("handles empty context", () => {
      const issues = evaluateCelRules({});

      expect(Array.isArray(issues)).toBe(true);
    });
  });

  describe("issue structure", () => {
    it("returns issues with correct structure", () => {
      const issues = evaluateCelRules({
        operation: "create",
        bucket: "invalid",
      });

      expect(issues.length).toBeGreaterThan(0);
      const issue = issues[0];

      expect(issue).toHaveProperty("source");
      expect(issue).toHaveProperty("code");
      expect(issue).toHaveProperty("message");
      expect(issue).toHaveProperty("rule");
      expect(issue.source).toBe("cel");
      expect(typeof issue.code).toBe("string");
      expect(typeof issue.message).toBe("string");
      expect(typeof issue.rule).toBe("string");
    });
  });
});
