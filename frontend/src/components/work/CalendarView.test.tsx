import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CalendarView } from "./CalendarView";
import type { CalendarEventResponse } from "@/lib/api-client";

const baseEvent: CalendarEventResponse = {
  item_id: "evt-1",
  canonical_id: "urn:app:event:gcal:primary:evt-1",
  name: "Client sync",
  description: "Discuss milestones",
  start_date: "2026-03-01T10:00:00Z",
  end_date: "2026-03-01T10:30:00Z",
  source: "google_calendar",
  provider: "google_calendar",
  calendar_id: "primary",
  event_id: "evt-1",
  access_role: "owner",
  writable: true,
  rsvp_status: null,
  sync_state: "Synced",
  updated_at: "2026-03-01T09:00:00Z",
};

describe("CalendarView", () => {
  it("renders events and opens details", async () => {
    const user = userEvent.setup();
    render(<CalendarView events={[baseEvent]} />);

    expect(screen.getByText("Client sync")).toBeInTheDocument();
    await user.click(screen.getByText("Client sync"));

    expect(screen.getByText("Event details")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Discuss milestones")).toBeInTheDocument();
  });

  it("switches between list/week/month modes", async () => {
    const user = userEvent.setup();
    render(<CalendarView events={[baseEvent]} />);

    await user.click(screen.getByRole("button", { name: "week" }));
    expect(screen.getAllByText(/No events/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "month" }));
    expect(screen.getAllByText("Client sync").length).toBeGreaterThan(0);
  });

  it("calls action callbacks from details", async () => {
    const user = userEvent.setup();
    const onPatchEvent = vi.fn().mockResolvedValue(undefined);
    const onRsvpEvent = vi.fn().mockResolvedValue(undefined);
    const onDeleteEvent = vi.fn().mockResolvedValue(undefined);

    render(
      <CalendarView
        events={[baseEvent]}
        onPatchEvent={onPatchEvent}
        onRsvpEvent={onRsvpEvent}
        onDeleteEvent={onDeleteEvent}
      />,
    );

    await user.click(screen.getByText("Client sync"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onPatchEvent).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(onRsvpEvent).toHaveBeenCalledWith(baseEvent.canonical_id, {
      status: "accepted",
    });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDeleteEvent).toHaveBeenCalledWith(baseEvent.canonical_id);
  });

  it("disables +30 min for non-writable provider events", async () => {
    const user = userEvent.setup();
    render(
      <CalendarView
        events={[
          {
            ...baseEvent,
            canonical_id: "urn:app:event:gcal:primary:evt-2",
            access_role: "reader",
            writable: false,
          },
        ]}
      />,
    );

    await user.click(screen.getByText("Client sync"));
    const plusThirty = screen.getByRole("button", { name: "+30 min" });
    expect(plusThirty).toBeDisabled();
  });

  it("renders event times in 24-hour HH:MM format", () => {
    render(<CalendarView events={[baseEvent]} />);
    const timeRange = screen.getByText(
      (value) => value.includes(":") && value.includes(" - "),
    );
    expect(timeRange.textContent).toMatch(/\b\d{2}:\d{2}\b/);
    expect(timeRange.textContent).not.toMatch(/\b(am|pm)\b/i);
  });
});
