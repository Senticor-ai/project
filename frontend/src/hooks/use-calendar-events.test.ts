import { describe, expect, it } from "vitest";
import { mergeCalendarEvents } from "./use-calendar-events";
import type { CalendarEventResponse } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// mergeCalendarEvents — pure function, no hooks needed
// ---------------------------------------------------------------------------

function makeApiEvent(
  overrides: Partial<CalendarEventResponse> = {},
): CalendarEventResponse {
  return {
    item_id: "item-1",
    canonical_id: "cal-1",
    name: "Team standup",
    description: null,
    start_date: "2026-02-26T09:00:00Z",
    end_date: "2026-02-26T09:30:00Z",
    source: "google_calendar",
    provider: "google_calendar",
    calendar_id: "primary",
    event_id: "evt-goog-1",
    access_role: "owner",
    writable: true,
    rsvp_status: "accepted",
    sync_state: "Synced",
    updated_at: "2026-02-26T08:00:00Z",
    ...overrides,
  };
}

const fallbackItems = [
  {
    id: "fb-1",
    name: "Fallback meeting",
    description: "A fallback event",
    source: "manual",
    startDate: "2026-03-01",
  },
  {
    id: "fb-2",
    name: "Google fallback",
    source: "google_calendar",
    scheduledDate: "2026-03-02",
  },
  { id: "fb-3" },
];

describe("mergeCalendarEvents", () => {
  it("returns API events when non-empty", () => {
    const apiEvents = [makeApiEvent(), makeApiEvent({ canonical_id: "cal-2" })];
    const result = mergeCalendarEvents(apiEvents, fallbackItems);
    expect(result).toBe(apiEvents);
    expect(result).toHaveLength(2);
  });

  it("returns fallback-mapped events when API events are undefined", () => {
    const result = mergeCalendarEvents(undefined, fallbackItems);
    expect(result).toHaveLength(3);
    const first = result[0]!;
    expect(first.name).toBe("Fallback meeting");
    expect(first.item_id).toBe("fb-1");
    expect(first.canonical_id).toBe("fb-1");
    expect(first.start_date).toBe("2026-03-01");
    expect(first.description).toBe("A fallback event");
    expect(first.source).toBe("manual");
    expect(first.sync_state).toBe("Local only");
    expect(first.provider).toBeNull();
    expect(first.writable).toBe(true);
  });

  it("returns fallback-mapped events when API events are empty array", () => {
    const result = mergeCalendarEvents([], fallbackItems);
    expect(result).toHaveLength(3);
  });

  it("maps google_calendar source to provider and Synced sync_state", () => {
    const result = mergeCalendarEvents(undefined, fallbackItems);
    const googleEvent = result[1]!;
    expect(googleEvent.provider).toBe("google_calendar");
    expect(googleEvent.sync_state).toBe("Synced");
  });

  it("uses scheduledDate as fallback when startDate is missing", () => {
    const result = mergeCalendarEvents(undefined, fallbackItems);
    expect(result[1]!.start_date).toBe("2026-03-02");
  });

  it("handles items with no name, date, or source", () => {
    const result = mergeCalendarEvents(undefined, fallbackItems);
    const minimal = result[2]!;
    expect(minimal.name).toBe("(Untitled)");
    expect(minimal.start_date).toBeNull();
    expect(minimal.source).toBe("manual");
    expect(minimal.sync_state).toBe("Local only");
  });

  it("returns empty array when both API and fallback are empty", () => {
    const result = mergeCalendarEvents(undefined, []);
    expect(result).toEqual([]);
  });

  it("sets end_date to null for all fallback events", () => {
    const result = mergeCalendarEvents(undefined, fallbackItems);
    for (const event of result) {
      expect(event.end_date).toBeNull();
    }
  });
});
