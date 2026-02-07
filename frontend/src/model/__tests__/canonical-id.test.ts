import { describe, it, expect } from "vitest";
import { createCanonicalId, parseCanonicalId } from "../canonical-id";

describe("createCanonicalId", () => {
  it("creates a valid URN for inbox", () => {
    const id = createCanonicalId("inbox", "abc-123");
    expect(id).toBe("urn:app:inbox:abc-123");
  });

  it("creates a valid URN for project", () => {
    const id = createCanonicalId("project", "xyz-789");
    expect(id).toBe("urn:app:project:xyz-789");
  });

  it("creates a valid URN for action", () => {
    const id = createCanonicalId("action", "a1b2c3d4");
    expect(id).toBe("urn:app:action:a1b2c3d4");
  });
});

describe("parseCanonicalId", () => {
  it("parses entity type and uuid", () => {
    const parsed = parseCanonicalId("urn:app:project:xyz-789");
    expect(parsed.entityType).toBe("project");
    expect(parsed.uuid).toBe("xyz-789");
  });

  it("handles UUIDs with colons", () => {
    const parsed = parseCanonicalId(
      "urn:app:inbox:a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    );
    expect(parsed.entityType).toBe("inbox");
    expect(parsed.uuid).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });

  it("roundtrips create -> parse", () => {
    const id = createCanonicalId("action", "test-uuid-123");
    const parsed = parseCanonicalId(id);
    expect(parsed.entityType).toBe("action");
    expect(parsed.uuid).toBe("test-uuid-123");
  });
});
