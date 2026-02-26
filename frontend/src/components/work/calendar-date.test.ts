import { describe, expect, it } from "vitest";
import { dayKeyFromValue } from "./calendar-date";

describe("calendar-date timezone mapping", () => {
  it("keeps same local day for CET calendar timestamps in Berlin", () => {
    expect(
      dayKeyFromValue("2026-02-26T11:00:00+01:00", "Europe/Berlin"),
    ).toBe("2026-02-26");
    expect(
      dayKeyFromValue("2026-02-26T15:45:00+01:00", "Europe/Berlin"),
    ).toBe("2026-02-26");
  });

  it("maps source timestamp to previous day for a west-coast viewer when needed", () => {
    expect(
      dayKeyFromValue("2026-02-27T00:30:00+01:00", "America/Los_Angeles"),
    ).toBe("2026-02-26");
  });

  it("maps source timestamp to next day for an eastward viewer when needed", () => {
    expect(
      dayKeyFromValue("2026-02-26T23:30:00-08:00", "Europe/Berlin"),
    ).toBe("2026-02-27");
  });
});

