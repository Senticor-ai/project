import { describe, expect, it } from "vitest";

import { mapHttpStatusToExitCode } from "./output.js";

describe("mapHttpStatusToExitCode", () => {
  it("maps auth errors to exit code 3", () => {
    expect(mapHttpStatusToExitCode(401)).toBe(3);
    expect(mapHttpStatusToExitCode(403)).toBe(3);
  });

  it("maps validation and server errors", () => {
    expect(mapHttpStatusToExitCode(422)).toBe(4);
    expect(mapHttpStatusToExitCode(500)).toBe(20);
  });
});
