import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarView } from "./CalendarView";
import type { CalendarEventResponse } from "@/lib/api-client";

const now = new Date();
const inHours = (hours: number) =>
  new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

const sampleEvents: CalendarEventResponse[] = [
  {
    item_id: "evt-1",
    canonical_id: "urn:app:event:gcal:primary:evt-1",
    name: "Client sync",
    description: "Discuss milestone delivery.",
    start_date: inHours(2),
    end_date: inHours(2.5),
    source: "google_calendar",
    provider: "google_calendar",
    calendar_id: "primary",
    event_id: "evt-1",
    access_role: "owner",
    writable: true,
    rsvp_status: "accepted",
    sync_state: "Synced",
    updated_at: now.toISOString(),
  },
  {
    item_id: "evt-2",
    canonical_id: "urn:app:event:gcal:primary:evt-2",
    name: "Staff 1:1",
    description: "Weekly check-in",
    start_date: inHours(5),
    end_date: inHours(5.5),
    source: "google_calendar",
    provider: "google_calendar",
    calendar_id: "primary",
    event_id: "evt-2",
    access_role: "reader",
    writable: false,
    rsvp_status: "tentative",
    sync_state: "Synced",
    updated_at: now.toISOString(),
  },
  {
    item_id: "evt-3",
    canonical_id: "urn:app:event:local:evt-3",
    name: "Deep work block",
    description: "Focus time",
    start_date: inHours(24),
    end_date: inHours(25),
    source: "manual",
    provider: null,
    calendar_id: null,
    event_id: null,
    access_role: null,
    writable: true,
    rsvp_status: null,
    sync_state: "Local only",
    updated_at: now.toISOString(),
  },
];

const meta = {
  title: "Work/CalendarView",
  component: CalendarView,
  args: {
    events: sampleEvents,
  },
} satisfies Meta<typeof CalendarView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onPatchEvent: async () => undefined,
    onRsvpEvent: async () => undefined,
    onDeleteEvent: async () => undefined,
  },
};

export const Empty: Story = {
  args: {
    events: [],
  },
};
