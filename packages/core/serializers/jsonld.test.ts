import { describe, expect, it } from "vitest";

import {
  buildBucketPatch,
  buildCreateItemJsonLd,
  buildFocusPatch,
  readAdditionalProperty,
} from "./jsonld.js";

describe("buildCreateItemJsonLd", () => {
  it("builds Action payload with bucket + project refs", () => {
    const item = buildCreateItemJsonLd({
      type: "Action",
      name: "File taxes",
      orgId: "7c43cef1-7e20-4784-9d56-9f9adc8baf1d",
      bucket: "next",
      projectId: "urn:app:project:123",
    });

    expect(item["@type"]).toBe("Action");
    expect(typeof item["@id"]).toBe("string");
    expect(String(item["@id"])).toContain(
      "urn:app:org:7c43cef1-7e20-4784-9d56-9f9adc8baf1d:action:",
    );
    expect(readAdditionalProperty(item, "app:bucket")).toBe("next");
    expect(readAdditionalProperty(item, "app:rawCapture")).toBe("File taxes");
    expect(readAdditionalProperty(item, "app:projectRefs")).toEqual(["urn:app:project:123"]);
  });

  it("builds Person payload with org metadata", () => {
    const item = buildCreateItemJsonLd({
      type: "Person",
      name: "Steuerberater Schmidt",
      orgId: "7c43cef1-7e20-4784-9d56-9f9adc8baf1d",
      orgRef: { id: "nueva-tierra", name: "Nueva Tierra" },
      orgRole: "accountant",
      email: "schmidt@steuer.de",
    });

    expect(item["@type"]).toBe("Person");
    expect(item.email).toBe("schmidt@steuer.de");
    expect(readAdditionalProperty(item, "app:orgRole")).toBe("accountant");
  });

  it("falls back to legacy urn format when org id is absent", () => {
    const item = buildCreateItemJsonLd({
      type: "Project",
      name: "Legacy-compatible ID",
    });
    expect(typeof item["@id"]).toBe("string");
    expect(String(item["@id"])).toMatch(/^urn:app:project:/);
  });
});

describe("buildBucketPatch", () => {
  it("builds patch object for app:bucket", () => {
    const patch = buildBucketPatch("waiting");
    expect(patch).toEqual({
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "app:bucket",
          value: "waiting",
        },
      ],
    });
  });
});

describe("buildFocusPatch", () => {
  it("builds patch object for app:isFocused", () => {
    const patch = buildFocusPatch(false);
    expect(patch).toEqual({
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "app:isFocused",
          value: false,
        },
      ],
    });
  });
});
