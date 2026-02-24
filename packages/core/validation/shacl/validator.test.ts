import { describe, expect, it } from "vitest";

import { validateWithShacl } from "./validator.js";

describe("validateWithShacl", () => {
  describe("Action validation", () => {
    it("accepts a valid Action", () => {
      const item = {
        "@type": "schema:Action",
        "schema:name": "File taxes",
        additionalProperty: [
          { propertyID: "app:bucket", value: "next" },
          { propertyID: "app:rawCapture", value: "Remember to file taxes" },
        ],
      };

      expect(validateWithShacl(item)).toEqual([]);
    });

    it("rejects Action without bucket", () => {
      const item = {
        "@type": "schema:Action",
        "schema:name": "File taxes",
        additionalProperty: [
          { propertyID: "app:rawCapture", value: "Remember to file taxes" },
        ],
      };

      const issues = validateWithShacl(item);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.field === "app:bucket")).toBe(true);
    });

    it("rejects Action without rawCapture", () => {
      const item = {
        "@type": "schema:Action",
        "schema:name": "File taxes",
        additionalProperty: [
          { propertyID: "app:bucket", value: "next" },
        ],
      };

      const issues = validateWithShacl(item);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.field === "app:rawCapture")).toBe(true);
    });

    it("rejects Action with invalid bucket value", () => {
      const item = {
        "@type": "schema:Action",
        "schema:name": "File taxes",
        additionalProperty: [
          { propertyID: "app:bucket", value: "invalid" },
          { propertyID: "app:rawCapture", value: "Remember to file taxes" },
        ],
      };

      const issues = validateWithShacl(item);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.code === "INVALID_VALUE")).toBe(true);
      expect(issues.some((issue) => issue.field === "app:bucket")).toBe(true);
    });

    it("accepts all valid bucket values", () => {
      const validBuckets = ["inbox", "next", "waiting", "someday", "calendar", "reference", "completed", "project"];

      for (const bucket of validBuckets) {
        const item = {
          "@type": "schema:Action",
          "schema:name": "File taxes",
          additionalProperty: [
            { propertyID: "app:bucket", value: bucket },
            { propertyID: "app:rawCapture", value: "Remember to file taxes" },
          ],
        };

        expect(validateWithShacl(item)).toEqual([]);
      }
    });
  });

  describe("Project validation", () => {
    it("accepts a valid Project", () => {
      const item = {
        "@type": "schema:Project",
        "schema:name": "Tax preparation 2026",
      };

      expect(validateWithShacl(item)).toEqual([]);
    });

    it("rejects Project without name", () => {
      const item = {
        "@type": "schema:Project",
      };

      const issues = validateWithShacl(item);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.field === "schema:name")).toBe(true);
      expect(issues.some((issue) => issue.code === "REQUIRED_PROPERTY_MISSING")).toBe(true);
    });
  });

  describe("Person validation", () => {
    it("accepts a valid Person", () => {
      const item = {
        "@type": "schema:Person",
        "schema:name": "Jane Doe",
        additionalProperty: [
          { propertyID: "app:orgRef", value: "org-123" },
          { propertyID: "app:orgRole", value: "member" },
        ],
      };

      expect(validateWithShacl(item)).toEqual([]);
    });

    it("rejects Person without name", () => {
      const item = {
        "@type": "schema:Person",
        additionalProperty: [
          { propertyID: "app:orgRef", value: "org-123" },
          { propertyID: "app:orgRole", value: "member" },
        ],
      };

      const issues = validateWithShacl(item);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.field === "schema:name")).toBe(true);
    });

    it("rejects Person without orgRef", () => {
      const item = {
        "@type": "schema:Person",
        "schema:name": "Jane Doe",
        additionalProperty: [
          { propertyID: "app:orgRole", value: "member" },
        ],
      };

      const issues = validateWithShacl(item);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.field === "app:orgRef")).toBe(true);
    });

    it("rejects Person without orgRole", () => {
      const item = {
        "@type": "schema:Person",
        "schema:name": "Jane Doe",
        additionalProperty: [
          { propertyID: "app:orgRef", value: "org-123" },
        ],
      };

      const issues = validateWithShacl(item);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.field === "app:orgRole")).toBe(true);
    });

    it("rejects Person with invalid orgRole", () => {
      const item = {
        "@type": "schema:Person",
        "schema:name": "Jane Doe",
        additionalProperty: [
          { propertyID: "app:orgRef", value: "org-123" },
          { propertyID: "app:orgRole", value: "invalid" },
        ],
      };

      const issues = validateWithShacl(item);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.code === "INVALID_VALUE")).toBe(true);
      expect(issues.some((issue) => issue.field === "app:orgRole")).toBe(true);
    });

    it("accepts all valid orgRole values", () => {
      const validRoles = ["member", "founder", "accountant", "advisor", "interest"];

      for (const role of validRoles) {
        const item = {
          "@type": "schema:Person",
          "schema:name": "Jane Doe",
          additionalProperty: [
            { propertyID: "app:orgRef", value: "org-123" },
            { propertyID: "app:orgRole", value: role },
          ],
        };

        expect(validateWithShacl(item)).toEqual([]);
      }
    });
  });

  describe("CreativeWork validation", () => {
    it("accepts a valid CreativeWork", () => {
      const item = {
        "@type": "schema:CreativeWork",
        "schema:name": "Tax regulations handbook",
      };

      expect(validateWithShacl(item)).toEqual([]);
    });

    it("rejects CreativeWork without name", () => {
      const item = {
        "@type": "schema:CreativeWork",
      };

      const issues = validateWithShacl(item);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.field === "schema:name")).toBe(true);
    });
  });

  describe("DigitalDocument validation", () => {
    it("accepts a valid DigitalDocument", () => {
      const item = {
        "@type": "schema:DigitalDocument",
        "schema:name": "tax-form-2026.pdf",
      };

      expect(validateWithShacl(item)).toEqual([]);
    });

    it("rejects DigitalDocument without name", () => {
      const item = {
        "@type": "schema:DigitalDocument",
      };

      const issues = validateWithShacl(item);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.field === "schema:name")).toBe(true);
    });
  });

  describe("type handling", () => {
    it("accepts type as plain string", () => {
      const item = {
        "@type": "Action",
        "schema:name": "File taxes",
        additionalProperty: [
          { propertyID: "app:bucket", value: "next" },
          { propertyID: "app:rawCapture", value: "Remember to file taxes" },
        ],
      };

      expect(validateWithShacl(item)).toEqual([]);
    });

    it("accepts type with schema: prefix", () => {
      const item = {
        "@type": "schema:Action",
        "schema:name": "File taxes",
        additionalProperty: [
          { propertyID: "app:bucket", value: "next" },
          { propertyID: "app:rawCapture", value: "Remember to file taxes" },
        ],
      };

      expect(validateWithShacl(item)).toEqual([]);
    });

    it("accepts type as array", () => {
      const item = {
        "@type": ["schema:Action", "http://example.org/OtherType"],
        "schema:name": "File taxes",
        additionalProperty: [
          { propertyID: "app:bucket", value: "next" },
          { propertyID: "app:rawCapture", value: "Remember to file taxes" },
        ],
      };

      expect(validateWithShacl(item)).toEqual([]);
    });

    it("accepts type as full URI", () => {
      const item = {
        "@type": "https://schema.org/Action",
        "schema:name": "File taxes",
        additionalProperty: [
          { propertyID: "app:bucket", value: "next" },
          { propertyID: "app:rawCapture", value: "Remember to file taxes" },
        ],
      };

      expect(validateWithShacl(item)).toEqual([]);
    });
  });

  describe("abortOnFirst parameter", () => {
    it("returns fewer errors when abortOnFirst=true (default)", () => {
      const item = {
        "@type": "schema:Action",
        "schema:name": "File taxes",
        additionalProperty: [], // Missing both bucket and rawCapture
      };

      const issuesAbortFirst = validateWithShacl(item, true);
      const issuesAll = validateWithShacl(item, false);

      expect(issuesAbortFirst.length).toBeGreaterThan(0);
      expect(issuesAll.length).toBeGreaterThanOrEqual(issuesAbortFirst.length);
    });

    it("returns all errors when abortOnFirst=false", () => {
      const item = {
        "@type": "schema:Action",
        "schema:name": "File taxes",
        additionalProperty: [], // Missing both bucket and rawCapture
      };

      const issues = validateWithShacl(item, false);
      expect(issues.length).toBeGreaterThan(1);
    });
  });

  describe("error structure", () => {
    it("returns issues with correct structure", () => {
      const item = {
        "@type": "schema:Action",
        "schema:name": "File taxes",
        additionalProperty: [
          { propertyID: "app:rawCapture", value: "Remember to file taxes" },
        ],
      };

      const issues = validateWithShacl(item);
      expect(issues.length).toBeGreaterThan(0);

      const issue = issues[0];
      expect(issue).toHaveProperty("source", "shacl");
      expect(issue).toHaveProperty("code");
      expect(issue).toHaveProperty("message");
      expect(typeof issue.code).toBe("string");
      expect(typeof issue.message).toBe("string");
    });

    it("includes field information when available", () => {
      const item = {
        "@type": "schema:Project",
      };

      const issues = validateWithShacl(item);
      const nameIssue = issues.find((issue) => issue.field === "schema:name");
      expect(nameIssue).toBeDefined();
      expect(nameIssue?.field).toBe("schema:name");
    });
  });

  describe("edge cases", () => {
    it("handles empty item object", () => {
      const item = {};

      const issues = validateWithShacl(item);
      expect(Array.isArray(issues)).toBe(true);
    });

    it("handles item without @type", () => {
      const item = {
        "schema:name": "Something",
      };

      const issues = validateWithShacl(item);
      expect(Array.isArray(issues)).toBe(true);
    });

    it("handles malformed additionalProperty", () => {
      const item = {
        "@type": "schema:Action",
        "schema:name": "File taxes",
        additionalProperty: "not-an-array",
      };

      const issues = validateWithShacl(item);
      expect(Array.isArray(issues)).toBe(true);
    });

    it("handles null values in additionalProperty", () => {
      const item = {
        "@type": "schema:Action",
        "schema:name": "File taxes",
        additionalProperty: [
          null,
          { propertyID: "app:bucket", value: "next" },
          { propertyID: "app:rawCapture", value: "Remember to file taxes" },
        ],
      };

      expect(validateWithShacl(item)).toEqual([]);
    });
  });
});
