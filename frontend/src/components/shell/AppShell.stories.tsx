import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { AppHeader, type AppView } from "./AppHeader";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { ConnectedBucketView } from "@/components/work/ConnectedBucketView";
import { seedMixedBuckets } from "@/test/msw/fixtures";
import type { Bucket } from "@/model/types";

// ---------------------------------------------------------------------------
// Connected workspace: seeds MSW store and renders ConnectedBucketView
// ---------------------------------------------------------------------------

function ConnectedWorkspace() {
  const [bucket, setBucket] = useState<Bucket>("inbox");
  return (
    <ConnectedBucketView activeBucket={bucket} onBucketChange={setBucket} />
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: "Screens/AppShell",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  beforeEach: () => {
    seedMixedBuckets();
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Default — full app shell with view switching
// ---------------------------------------------------------------------------

export const Default: Story = {
  render: function AppShellDemo() {
    const [view, setView] = useState<AppView>("workspace");

    return (
      <div className="min-h-screen bg-surface p-6">
        <AppHeader
          username="wolfgang"
          currentView={view}
          onNavigate={setView}
          onSignOut={fn()}
          className="mb-6"
        />
        {view === "workspace" && <ConnectedWorkspace />}
        {view === "settings" && <SettingsScreen />}
      </div>
    );
  },
  play: async ({ canvas, step }) => {
    await step("Verify workspace loads with real data", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Unprocessed thought")).toBeInTheDocument();
      }, { timeout: 10000 });
    });
  },
};

// ---------------------------------------------------------------------------
// SwitchToSettings — interactive: navigate to settings and back
// ---------------------------------------------------------------------------

export const SwitchToSettings: Story = {
  render: function AppShellSwitchDemo() {
    const [view, setView] = useState<AppView>("workspace");

    return (
      <div className="min-h-screen bg-surface p-6">
        <AppHeader
          username="wolfgang"
          currentView={view}
          onNavigate={setView}
          onSignOut={fn()}
          className="mb-6"
        />
        {view === "workspace" && <ConnectedWorkspace />}
        {view === "settings" && <SettingsScreen />}
      </div>
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Wait for workspace to load", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Unprocessed thought")).toBeInTheDocument();
      }, { timeout: 10000 });
    });

    await step("Open menu and navigate to Settings", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Main menu" }));
      await userEvent.click(canvas.getByText("Settings"));
    });

    await step("Verify SettingsScreen is visible", async () => {
      const main = canvas.getByRole("main", { name: "Settings content" });
      await expect(
        within(main).getByRole("button", { name: "Import from Nirvana" }),
      ).toBeInTheDocument();
    });

    await step("Navigate back to Workspace", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Main menu" }));
      await userEvent.click(canvas.getByText("Workspace"));
    });

    await step("Verify Workspace is visible with real data", async () => {
      await waitFor(() => {
        expect(
          canvas.getByRole("main", { name: "Bucket content" }),
        ).toBeInTheDocument();
      }, { timeout: 10000 });
    });
  },
};

// ---------------------------------------------------------------------------
// StartInSettings — starts on the settings view
// ---------------------------------------------------------------------------

export const StartInSettings: Story = {
  render: function AppShellSettingsDemo() {
    const [view, setView] = useState<AppView>("settings");

    return (
      <div className="min-h-screen bg-surface p-6">
        <AppHeader
          username="wolfgang"
          currentView={view}
          onNavigate={setView}
          onSignOut={fn()}
          className="mb-6"
        />
        {view === "workspace" && <ConnectedWorkspace />}
        {view === "settings" && <SettingsScreen />}
      </div>
    );
  },
};
