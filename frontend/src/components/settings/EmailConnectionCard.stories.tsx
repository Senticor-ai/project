import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
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

const meta = {
  title: "Settings/EmailConnectionCard",
  component: EmailConnectionCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="p-4" style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    connection: baseConnection,
    onSync: fn(),
    onDisconnect: fn(),
    onUpdateSyncInterval: fn(),
    onUpdateMarkRead: fn(),
  },
} satisfies Meta<typeof EmailConnectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const Syncing: Story = {
  args: {
    isSyncing: true,
  },
};

export const Error: Story = {
  args: {
    connection: {
      ...baseConnection,
      last_sync_error: "OAuth token expired. Please reconnect.",
    },
  },
};

export const NeverSynced: Story = {
  args: {
    connection: {
      ...baseConnection,
      last_sync_at: null,
      last_sync_message_count: null,
    },
  },
};

export const NoDisplayName: Story = {
  args: {
    connection: {
      ...baseConnection,
      display_name: null,
    },
  },
};

export const MarkReadEnabled: Story = {
  args: {
    connection: {
      ...baseConnection,
      sync_mark_read: true,
    },
  },
};

export const PushActive: Story = {
  args: {
    connection: {
      ...baseConnection,
      watch_active: true,
      watch_expires_at: "2026-02-18T10:00:00Z",
    },
  },
};

export const PushExpired: Story = {
  args: {
    connection: {
      ...baseConnection,
      watch_active: false,
      watch_expires_at: "2026-02-10T10:00:00Z",
    },
  },
};

export const ManualOnly: Story = {
  args: {
    connection: {
      ...baseConnection,
      sync_interval_minutes: 0,
    },
  },
};
