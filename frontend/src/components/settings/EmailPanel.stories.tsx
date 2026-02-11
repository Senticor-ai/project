import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
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
  created_at: "2026-02-01T08:00:00Z",
};

const meta = {
  title: "Settings/EmailPanel",
  component: EmailPanel,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="p-4" style={{ maxWidth: 600 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onConnectGmail: fn(),
    onSync: fn(),
    onDisconnect: fn(),
    onUpdateSyncInterval: fn(),
    onUpdateMarkRead: fn(),
  },
} satisfies Meta<typeof EmailPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyState: Story = {
  args: {
    connections: [],
  },
  play: async ({ canvas }) => {
    const panel = within(
      canvas.getByText("E-Mail-Verbindungen").closest("div")!,
    );
    await expect(
      panel.getByText("Keine E-Mail-Verbindung eingerichtet"),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const Connected: Story = {
  args: {
    connections: [mockConnection],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Max Mustermann")).toBeInTheDocument();
    await expect(canvas.getByText("Verbunden")).toBeInTheDocument();
  },
};

export const Syncing: Story = {
  args: {
    connections: [mockConnection],
    syncingConnectionId: "conn-1",
  },
};

export const WithError: Story = {
  args: {
    connections: [
      {
        ...mockConnection,
        last_sync_error:
          "OAuth token expired. Please reconnect your Gmail account.",
      },
    ],
  },
};

export const MultipleConnections: Story = {
  args: {
    connections: [
      mockConnection,
      {
        ...mockConnection,
        connection_id: "conn-2",
        email_address: "privat@gmail.com",
        display_name: null,
        last_sync_at: null,
        last_sync_message_count: null,
      },
    ],
  },
};
