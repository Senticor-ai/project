import { render, screen, within } from "@testing-library/react";
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

  // ---------------------------------------------------------------------------
  // P2: Empty state — refresh CTA
  // ---------------------------------------------------------------------------

  it("shows empty state with refresh CTA when no events", () => {
    const onRefresh = vi.fn();
    render(<CalendarView events={[]} onRefresh={onRefresh} />);

    expect(screen.getByText(/No upcoming events/i)).toBeInTheDocument();
    const refreshBtn = screen.getByRole("button", { name: /Refresh/i });
    expect(refreshBtn).toBeInTheDocument();
  });

  it("calls onRefresh when refresh CTA is clicked", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<CalendarView events={[]} onRefresh={onRefresh} />);

    await user.click(screen.getByRole("button", { name: /Refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // P2: Permission error state
  // ---------------------------------------------------------------------------

  it("shows permission error with settings CTA when syncError is provided", () => {
    render(<CalendarView events={[]} syncError="Calendar permission denied" />);

    expect(screen.getByText(/Calendar permission denied/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Settings/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // P2: Write failure retry
  // ---------------------------------------------------------------------------

  it("shows retry button for events with sync_state Sync failed", async () => {
    const user = userEvent.setup();
    const onRetrySync = vi.fn();
    const failedEvent: CalendarEventResponse = {
      ...baseEvent,
      sync_state: "Sync failed",
    };

    render(<CalendarView events={[failedEvent]} onRetrySync={onRetrySync} />);

    await user.click(screen.getByText("Client sync"));
    const retryBtn = screen.getByRole("button", { name: /Retry/i });
    expect(retryBtn).toBeInTheDocument();

    await user.click(retryBtn);
    expect(onRetrySync).toHaveBeenCalledWith(failedEvent.canonical_id);
  });

  // ---------------------------------------------------------------------------
  // P2: Recurrence label
  // ---------------------------------------------------------------------------

  it("shows 'This occurrence only' label for recurring events in detail panel", async () => {
    const user = userEvent.setup();
    const recurringEvent: CalendarEventResponse = {
      ...baseEvent,
      recurring: true,
    } as CalendarEventResponse & { recurring: boolean };

    render(<CalendarView events={[recurringEvent]} />);

    await user.click(screen.getByText("Client sync"));
    expect(screen.getByText(/This occurrence only/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // P1: Project filter
  // ---------------------------------------------------------------------------

  it("filters events by selected projects", async () => {
    const user = userEvent.setup();
    const projects = [
      { id: "proj-1", name: "Alpha" },
      { id: "proj-2", name: "Beta" },
    ];

    const events: CalendarEventResponse[] = [
      { ...baseEvent, project_ids: ["proj-1"] } as CalendarEventResponse & {
        project_ids: string[];
      },
      {
        ...baseEvent,
        canonical_id: "urn:app:event:gcal:primary:evt-2",
        item_id: "evt-2",
        name: "Beta meeting",
        project_ids: ["proj-2"],
      } as CalendarEventResponse & { project_ids: string[] },
    ];

    render(<CalendarView events={events} projects={projects} />);

    // Both events visible initially
    expect(screen.getByText("Client sync")).toBeInTheDocument();
    expect(screen.getByText("Beta meeting")).toBeInTheDocument();

    // Click project filter button for Alpha
    const filterBtn = screen.getByRole("button", { name: /Alpha/i });
    await user.click(filterBtn);

    // Only Alpha event should be visible
    expect(screen.getByText("Client sync")).toBeInTheDocument();
    expect(screen.queryByText("Beta meeting")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // P1: Project association editor
  // ---------------------------------------------------------------------------

  it("shows project links editor in detail panel", async () => {
    const user = userEvent.setup();
    const projects = [
      { id: "proj-1", name: "Alpha" },
      { id: "proj-2", name: "Beta" },
    ];
    const onPatchEvent = vi.fn().mockResolvedValue(undefined);

    const event: CalendarEventResponse = {
      ...baseEvent,
      project_ids: ["proj-1"],
    } as CalendarEventResponse & { project_ids: string[] };

    render(
      <CalendarView
        events={[event]}
        projects={projects}
        onPatchEvent={onPatchEvent}
      />,
    );

    await user.click(screen.getByText("Client sync"));

    // Should show project association section in detail panel
    expect(screen.getByText("Projects")).toBeInTheDocument();

    // Alpha should be shown as linked — find within the parent container
    const projectLabel = screen.getByText("Projects");
    const projectSection = projectLabel.parentElement!;
    expect(within(projectSection).getByText("Alpha")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // P2: ETag/409 conflict handling
  // ---------------------------------------------------------------------------

  it("shows conflict message when onPatchEvent rejects with 409", async () => {
    const user = userEvent.setup();
    const onPatchEvent = vi.fn().mockRejectedValue({ status: 409 });

    render(<CalendarView events={[baseEvent]} onPatchEvent={onPatchEvent} />);

    await user.click(screen.getByText("Client sync"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getByText(/modified elsewhere|conflict/i),
    ).toBeInTheDocument();
  });
});
