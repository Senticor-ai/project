import { describe, it, expect } from "vitest";
import {
  parsePathname,
  buildPath,
  isValidBucket,
  isValidSettingsTab,
  type LocationState,
} from "./route-utils";

describe("parsePathname", () => {
  it("parses /workspace/inbox", () => {
    expect(parsePathname("/workspace/inbox")).toEqual<LocationState>({
      view: "workspace",
      sub: "inbox",
    });
  });

  it("parses /workspace/next", () => {
    expect(parsePathname("/workspace/next")).toEqual<LocationState>({
      view: "workspace",
      sub: "next",
    });
  });

  it("parses /workspace/focus", () => {
    expect(parsePathname("/workspace/focus")).toEqual<LocationState>({
      view: "workspace",
      sub: "focus",
    });
  });

  it("parses all valid bucket paths", () => {
    const buckets = [
      "inbox",
      "focus",
      "next",
      "project",
      "waiting",
      "calendar",
      "someday",
      "reference",
    ];
    for (const bucket of buckets) {
      expect(parsePathname(`/workspace/${bucket}`)).toEqual<LocationState>({
        view: "workspace",
        sub: bucket,
      });
    }
  });

  it("parses /settings/import-export", () => {
    expect(parsePathname("/settings/import-export")).toEqual<LocationState>({
      view: "settings",
      sub: "import-export",
    });
  });

  it("parses /settings/labels", () => {
    expect(parsePathname("/settings/labels")).toEqual<LocationState>({
      view: "settings",
      sub: "labels",
    });
  });

  it("parses /settings/preferences", () => {
    expect(parsePathname("/settings/preferences")).toEqual<LocationState>({
      view: "settings",
      sub: "preferences",
    });
  });

  it("defaults / to workspace/inbox", () => {
    expect(parsePathname("/")).toEqual<LocationState>({
      view: "workspace",
      sub: "inbox",
    });
  });

  it("defaults /workspace to workspace/inbox", () => {
    expect(parsePathname("/workspace")).toEqual<LocationState>({
      view: "workspace",
      sub: "inbox",
    });
  });

  it("defaults /settings to settings/import-export", () => {
    expect(parsePathname("/settings")).toEqual<LocationState>({
      view: "settings",
      sub: "import-export",
    });
  });

  it("defaults invalid top-level path to workspace/inbox", () => {
    expect(parsePathname("/bogus")).toEqual<LocationState>({
      view: "workspace",
      sub: "inbox",
    });
  });

  it("defaults invalid workspace sub-path to workspace/inbox", () => {
    expect(parsePathname("/workspace/invalid")).toEqual<LocationState>({
      view: "workspace",
      sub: "inbox",
    });
  });

  it("defaults invalid settings sub-path to settings/import-export", () => {
    expect(parsePathname("/settings/invalid")).toEqual<LocationState>({
      view: "settings",
      sub: "import-export",
    });
  });

  it("handles empty string", () => {
    expect(parsePathname("")).toEqual<LocationState>({
      view: "workspace",
      sub: "inbox",
    });
  });

  it("handles trailing slash", () => {
    expect(parsePathname("/workspace/inbox/")).toEqual<LocationState>({
      view: "workspace",
      sub: "inbox",
    });
  });

  it("ignores extra path segments", () => {
    expect(
      parsePathname("/workspace/inbox/extra/stuff"),
    ).toEqual<LocationState>({
      view: "workspace",
      sub: "inbox",
    });
  });
});

describe("buildPath", () => {
  it("builds /workspace/inbox", () => {
    expect(buildPath("workspace", "inbox")).toBe("/workspace/inbox");
  });

  it("builds /workspace/next", () => {
    expect(buildPath("workspace", "next")).toBe("/workspace/next");
  });

  it("builds /settings/labels", () => {
    expect(buildPath("settings", "labels")).toBe("/settings/labels");
  });

  it("builds /settings/import-export", () => {
    expect(buildPath("settings", "import-export")).toBe(
      "/settings/import-export",
    );
  });
});

describe("isValidBucket", () => {
  it("returns true for valid buckets", () => {
    expect(isValidBucket("inbox")).toBe(true);
    expect(isValidBucket("focus")).toBe(true);
    expect(isValidBucket("next")).toBe(true);
    expect(isValidBucket("project")).toBe(true);
    expect(isValidBucket("waiting")).toBe(true);
    expect(isValidBucket("calendar")).toBe(true);
    expect(isValidBucket("someday")).toBe(true);
    expect(isValidBucket("reference")).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isValidBucket("invalid")).toBe(false);
    expect(isValidBucket("")).toBe(false);
    expect(isValidBucket("workspace")).toBe(false);
  });
});

describe("isValidSettingsTab", () => {
  it("returns true for valid settings tabs", () => {
    expect(isValidSettingsTab("import-export")).toBe(true);
    expect(isValidSettingsTab("labels")).toBe(true);
    expect(isValidSettingsTab("preferences")).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isValidSettingsTab("invalid")).toBe(false);
    expect(isValidSettingsTab("")).toBe(false);
    expect(isValidSettingsTab("inbox")).toBe(false);
  });
});
