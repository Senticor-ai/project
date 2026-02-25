import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmailConnectionCard } from "./EmailConnectionCard";
import type {
  EmailConnectionCalendarResponse,
  EmailConnectionResponse,
} from "@/lib/api-client";

const baseConnection: EmailConnectionResponse = {
  connection_id: "conn-1",
  email_address: "beamte@gmail.com",
  display_name: "Max Mustermann",
  auth_method: "oauth2",
  oauth_provider: "gmail",
  sync_interval_minutes: 15,
  sync_mark_read: false,
  calendar_sync_enabled: true,
  calendar_selected_ids: ["primary"],
  last_sync_at: "2026-02-11T10:00:00Z",
  last_sync_error: null,
  last_sync_message_count: 42,
  is_active: true,
  watch_active: false,
  watch_expires_at: null,
  created_at: "2026-02-01T08:00:00Z",
};

const calendars: EmailConnectionCalendarResponse[] = [
  {
    calendar_id: "primary",
    summary: "Primary",
    primary: true,
    selected: true,
    access_role: "owner",
  },
  {
    calendar_id: "team@group.calendar.google.com",
    summary: "Team",
    primary: false,
    selected: false,
    access_role: "writer",
  },
];

describe("EmailConnectionCard", () => {
  it("renders email address and display name", () => {
    render(<EmailConnectionCard connection={baseConnection} />);
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("beamte@gmail.com")).toBeInTheDocument();
  });

  it("shows connected status when last_sync_at is set", () => {
    render(<EmailConnectionCard connection={baseConnection} />);
    expect(screen.getByText("Verbunden")).toBeInTheDocument();
  });

  it("shows sync count and timestamp", () => {
    render(<EmailConnectionCard connection={baseConnection} />);
    expect(screen.getByText(/42 E-Mails/)).toBeInTheDocument();
  });

  it("shows calendar sync metadata when available", () => {
    render(
      <EmailConnectionCard
        connection={{
          ...baseConnection,
          last_calendar_sync_at: "2026-02-11T10:05:00Z",
          last_calendar_sync_event_count: 7,
        }}
      />,
    );
    expect(screen.getByText(/Kalender:/)).toBeInTheDocument();
    expect(screen.getByText(/7 Ereignisse/)).toBeInTheDocument();
  });

  it("shows error status when last_sync_error is set", () => {
    render(
      <EmailConnectionCard
        connection={{ ...baseConnection, last_sync_error: "Token expired" }}
      />,
    );
    expect(screen.getByText("Fehler")).toBeInTheDocument();
    expect(screen.getByText("Token expired")).toBeInTheDocument();
  });

  it("shows error status when calendar sync has an error", () => {
    render(
      <EmailConnectionCard
        connection={{
          ...baseConnection,
          last_calendar_sync_error: "calendar token expired",
        }}
      />,
    );
    expect(
      screen.getByText(/Letzter Kalender-Sync-Fehler: calendar token expired/),
    ).toBeInTheDocument();
  });

  it("hides stale api-not-enabled calendar error when calendars load successfully", () => {
    render(
      <EmailConnectionCard
        connection={{
          ...baseConnection,
          last_calendar_sync_error:
            "Google Calendar API is not enabled in this Google Cloud project. Enable the Calendar API and reconnect.",
        }}
        availableCalendars={calendars}
      />,
    );

    expect(
      screen.queryByText(
        /Google Calendar API is not enabled in this Google Cloud project/,
      ),
    ).not.toBeInTheDocument();
  });

  it("shows syncing status when isSyncing is true", () => {
    render(<EmailConnectionCard connection={baseConnection} isSyncing />);
    expect(screen.getByText("Synchronisiere...")).toBeInTheDocument();
  });

  it("disables sync button when syncing", () => {
    render(<EmailConnectionCard connection={baseConnection} isSyncing />);
    expect(
      screen.getByRole("button", { name: /jetzt synchronisieren/i }),
    ).toBeDisabled();
  });

  it("calls onSync when sync button is clicked", async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();
    render(<EmailConnectionCard connection={baseConnection} onSync={onSync} />);

    await user.click(
      screen.getByRole("button", { name: /jetzt synchronisieren/i }),
    );
    expect(onSync).toHaveBeenCalledOnce();
  });

  it("calls onDisconnect when disconnect button is clicked", async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    render(
      <EmailConnectionCard
        connection={baseConnection}
        onDisconnect={onDisconnect}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /verbindung trennen/i }),
    );
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("calls onUpdateSyncInterval when interval is changed", async () => {
    const user = userEvent.setup();
    const onUpdateSyncInterval = vi.fn();
    render(
      <EmailConnectionCard
        connection={baseConnection}
        onUpdateSyncInterval={onUpdateSyncInterval}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Sync interval"), "30");
    expect(onUpdateSyncInterval).toHaveBeenCalledWith(30);
  });

  it("calls onUpdateMarkRead when checkbox is toggled", async () => {
    const user = userEvent.setup();
    const onUpdateMarkRead = vi.fn();
    render(
      <EmailConnectionCard
        connection={baseConnection}
        onUpdateMarkRead={onUpdateMarkRead}
      />,
    );

    await user.click(screen.getByLabelText("Mark as read in Gmail"));
    expect(onUpdateMarkRead).toHaveBeenCalledWith(true);
  });

  it("renders without display_name, showing only email", () => {
    render(
      <EmailConnectionCard
        connection={{ ...baseConnection, display_name: null }}
      />,
    );
    expect(screen.getByText("beamte@gmail.com")).toBeInTheDocument();
    expect(screen.queryByText("Max Mustermann")).not.toBeInTheDocument();
  });

  it("shows 'Nicht synchronisiert' when never synced", () => {
    render(
      <EmailConnectionCard
        connection={{ ...baseConnection, last_sync_at: null }}
      />,
    );
    expect(screen.getByText("Nicht synchronisiert")).toBeInTheDocument();
  });

  it("shows 'Echtzeit' badge when watch is active", () => {
    render(
      <EmailConnectionCard
        connection={{ ...baseConnection, watch_active: true }}
      />,
    );
    expect(screen.getByText("Echtzeit")).toBeInTheDocument();
    expect(screen.getByText("Echtzeit-Sync (Push)")).toBeInTheDocument();
  });

  it("shows 'Fallback-Intervall' label when push is active", () => {
    render(
      <EmailConnectionCard
        connection={{ ...baseConnection, watch_active: true }}
      />,
    );
    expect(screen.getByText(/Fallback-Intervall/)).toBeInTheDocument();
    expect(
      screen.getByText(/Push-Benachrichtigungen aktiv/),
    ).toBeInTheDocument();
  });

  it("shows polling indicator when watch is not active", () => {
    render(<EmailConnectionCard connection={baseConnection} />);
    expect(screen.getByText(/Polling alle 15 Min\./)).toBeInTheDocument();
    expect(screen.getByText(/Sync-Intervall/)).toBeInTheDocument();
  });

  it("shows 'Nur manuell' when sync interval is 0 and no push", () => {
    render(
      <EmailConnectionCard
        connection={{ ...baseConnection, sync_interval_minutes: 0 }}
      />,
    );
    expect(screen.getByText("Nur manuell")).toBeInTheDocument();
  });

  it("renders calendar opt-in controls when calendars are available", () => {
    render(
      <EmailConnectionCard
        connection={baseConnection}
        availableCalendars={calendars}
      />,
    );
    expect(screen.getByText("Kalender-Sync")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /primary/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /team/i })).not.toBeChecked();
  });

  it("calls onToggleCalendarSync when sync toggle is changed", async () => {
    const user = userEvent.setup();
    const onToggleCalendarSync = vi.fn();
    render(
      <EmailConnectionCard
        connection={baseConnection}
        availableCalendars={calendars}
        onToggleCalendarSync={onToggleCalendarSync}
      />,
    );

    await user.click(screen.getByLabelText("Enable calendar sync"));
    expect(onToggleCalendarSync).toHaveBeenCalledWith(false);
  });

  it("calls onUpdateCalendarSelection when a calendar is opted in", async () => {
    const user = userEvent.setup();
    const onUpdateCalendarSelection = vi.fn();
    render(
      <EmailConnectionCard
        connection={baseConnection}
        availableCalendars={calendars}
        onUpdateCalendarSelection={onUpdateCalendarSelection}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /team/i }));
    expect(onUpdateCalendarSelection).toHaveBeenCalledWith([
      "primary",
      "team@group.calendar.google.com",
    ]);
  });

  it("disables opt-out for the last selected calendar", () => {
    render(
      <EmailConnectionCard
        connection={baseConnection}
        availableCalendars={[
          {
            calendar_id: "primary",
            summary: "Primary",
            primary: true,
            selected: true,
            access_role: "owner",
          },
        ]}
      />,
    );

    expect(screen.getByRole("checkbox", { name: /primary/i })).toBeDisabled();
  });

  it("shows calendar load error instead of empty-state hint", () => {
    render(
      <EmailConnectionCard
        connection={baseConnection}
        calendarLoadError="Request had insufficient authentication scopes."
      />,
    );

    expect(
      screen.getByText(
        /Kalender konnten nicht geladen werden\. Bitte Verbindung neu herstellen/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Keine Kalender verfügbar."),
    ).not.toBeInTheDocument();
  });
});
