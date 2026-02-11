import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmailConnectionCard } from "./EmailConnectionCard";
import type { EmailConnectionResponse } from "@/lib/api-client";

const baseConnection: EmailConnectionResponse = {
  connection_id: "conn-1",
  email_address: "beamte@gmail.com",
  display_name: "Max Mustermann",
  auth_method: "oauth2",
  oauth_provider: "gmail",
  sync_interval_minutes: 15,
  sync_mark_read: false,
  last_sync_at: "2026-02-11T10:00:00Z",
  last_sync_error: null,
  last_sync_message_count: 42,
  is_active: true,
  watch_active: false,
  watch_expires_at: null,
  created_at: "2026-02-01T08:00:00Z",
};

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

  it("shows error status when last_sync_error is set", () => {
    render(
      <EmailConnectionCard
        connection={{ ...baseConnection, last_sync_error: "Token expired" }}
      />,
    );
    expect(screen.getByText("Fehler")).toBeInTheDocument();
    expect(screen.getByText("Token expired")).toBeInTheDocument();
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
});
