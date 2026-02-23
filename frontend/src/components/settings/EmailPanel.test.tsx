import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmailPanel } from "./EmailPanel";
import type { EmailConnectionResponse } from "@/lib/api-client";

const mockConnection: EmailConnectionResponse = {
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

describe("EmailPanel", () => {
  it("renders empty state when no connections", () => {
    render(<EmailPanel connections={[]} />);
    expect(
      screen.getByText("Keine E-Mail-Verbindung eingerichtet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mit google verbinden/i }),
    ).toBeInTheDocument();
  });

  it("shows loading spinner when isLoading", () => {
    render(<EmailPanel isLoading />);
    expect(screen.getByText("progress_activity")).toBeInTheDocument();
    expect(
      screen.queryByText("Keine E-Mail-Verbindung eingerichtet"),
    ).not.toBeInTheDocument();
  });

  it("renders connection card when connections exist", () => {
    render(<EmailPanel connections={[mockConnection]} />);
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("beamte@gmail.com")).toBeInTheDocument();
  });

  it("renders multiple active connections and syncs the selected one", async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();
    const secondConnection: EmailConnectionResponse = {
      ...mockConnection,
      connection_id: "conn-2",
      email_address: "wolfgang@ihloff.de",
      display_name: "Wolfgang Ihloff",
    };

    render(
      <EmailPanel
        connections={[mockConnection, secondConnection]}
        onSync={onSync}
      />,
    );

    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("Wolfgang Ihloff")).toBeInTheDocument();

    const syncButtons = screen.getAllByRole("button", {
      name: /jetzt synchronisieren/i,
    });
    await user.click(syncButtons[1]!);

    expect(onSync).toHaveBeenCalledWith("conn-2");
  });

  it("hides inactive connections", () => {
    const inactive = { ...mockConnection, is_active: false };
    render(<EmailPanel connections={[inactive]} />);
    expect(
      screen.getByText("Keine E-Mail-Verbindung eingerichtet"),
    ).toBeInTheDocument();
  });

  it("shows add button when connections exist", () => {
    render(<EmailPanel connections={[mockConnection]} />);
    expect(
      screen.getByRole("button", { name: /weitere verbindung/i }),
    ).toBeInTheDocument();
  });

  it("calls onConnectGmail from empty state button", async () => {
    const user = userEvent.setup();
    const onConnectGmail = vi.fn();
    render(<EmailPanel connections={[]} onConnectGmail={onConnectGmail} />);

    await user.click(
      screen.getByRole("button", { name: /mit google verbinden/i }),
    );
    expect(onConnectGmail).toHaveBeenCalledOnce();
  });

  it("calls onSync with connection id", async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();
    render(<EmailPanel connections={[mockConnection]} onSync={onSync} />);

    await user.click(
      screen.getByRole("button", { name: /jetzt synchronisieren/i }),
    );
    expect(onSync).toHaveBeenCalledWith("conn-1");
  });

  it("calls onDisconnect with connection id", async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    render(
      <EmailPanel connections={[mockConnection]} onDisconnect={onDisconnect} />,
    );

    await user.click(
      screen.getByRole("button", { name: /verbindung trennen/i }),
    );
    expect(onDisconnect).toHaveBeenCalledWith("conn-1");
  });

  it("passes syncingConnectionId to card", () => {
    render(
      <EmailPanel
        connections={[mockConnection]}
        syncingConnectionId="conn-1"
      />,
    );
    expect(screen.getByText("Synchronisiere...")).toBeInTheDocument();
  });
});
