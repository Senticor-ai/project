import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { EmailPanel } from "./EmailPanel";
import type { EmailConnectionResponse } from "@/lib/api-client";
import {
  useDisconnectEmail,
  useEmailConnections,
  useTriggerEmailSync,
  useUpdateEmailConnection,
} from "@/hooks/use-email-connections";
import { createEmailConnection, store } from "@/test/msw/fixtures";

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

export const MswMultiAccountSync: Story = {
  beforeEach: () => {
    store.clear();

    const alpha = createEmailConnection({
      connection_id: "conn-alpha",
      email_address: "alpha@gmail.com",
      display_name: "Alpha",
      last_sync_message_count: 12,
      last_sync_at: "2026-02-11T10:00:00Z",
    });
    const beta = createEmailConnection({
      connection_id: "conn-beta",
      email_address: "beta@gmail.com",
      display_name: "Beta",
      last_sync_message_count: 1,
      last_sync_at: "2026-02-11T09:00:00Z",
    });

    store.emailConnections.set(alpha.connection_id, alpha);
    store.emailConnections.set(beta.connection_id, beta);
  },
  render: () => {
    const { data: connections = [], isLoading } = useEmailConnections();
    const syncMutation = useTriggerEmailSync();
    const disconnectMutation = useDisconnectEmail();
    const updateMutation = useUpdateEmailConnection();
    const syncingConnectionId =
      syncMutation.isPending && typeof syncMutation.variables === "string"
        ? syncMutation.variables
        : null;

    return (
      <EmailPanel
        connections={connections}
        isLoading={isLoading}
        onSync={(connectionId) => syncMutation.mutate(connectionId)}
        onDisconnect={(connectionId) => disconnectMutation.mutate(connectionId)}
        onUpdateSyncInterval={(connectionId, minutes) =>
          updateMutation.mutate({
            id: connectionId,
            patch: { sync_interval_minutes: minutes },
          })
        }
        onUpdateMarkRead={(connectionId, markRead) =>
          updateMutation.mutate({
            id: connectionId,
            patch: { sync_mark_read: markRead },
          })
        }
        syncingConnectionId={syncingConnectionId}
      />
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Shows both connected accounts", async () => {
      await waitFor(() => {
        expect(canvas.getByText("alpha@gmail.com")).toBeInTheDocument();
        expect(canvas.getByText("beta@gmail.com")).toBeInTheDocument();
      });
    });

    await step(
      "Syncing one account updates only that account's count",
      async () => {
        const syncButtons = canvas.getAllByRole("button", {
          name: /jetzt synchronisieren/i,
        });
        await userEvent.click(syncButtons[1]!);

        await waitFor(() => {
          expect(canvas.getByText(/4 E-Mails/)).toBeInTheDocument();
          expect(canvas.getByText(/12 E-Mails/)).toBeInTheDocument();
        });
      },
    );
  },
};
