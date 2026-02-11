import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { AppHeader, type AppView } from "./AppHeader";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { ConnectedBucketView } from "@/components/work/ConnectedBucketView";
import { navItems } from "@/components/work/bucket-nav-items";
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
      <div className="min-h-screen bg-surface px-6 pb-6 pt-3">
        <AppHeader
          username="wolfgang"
          currentView={view}
          onNavigate={setView}
          onSignOut={fn()}
          onLogoClick={fn()}
          className="mb-6"
        />
        {view === "workspace" && <ConnectedWorkspace />}
        {view === "settings" && <SettingsScreen />}
      </div>
    );
  },
  play: async ({ canvas, step }) => {
    await step("Verify workspace loads with real data", async () => {
      await waitFor(
        () => {
          expect(canvas.getByText("Unprocessed thought")).toBeInTheDocument();
        },
        { timeout: 10000 },
      );
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
      <div className="min-h-screen bg-surface px-6 pb-6 pt-3">
        <AppHeader
          username="wolfgang"
          currentView={view}
          onNavigate={setView}
          onSignOut={fn()}
          onLogoClick={fn()}
          className="mb-6"
        />
        {view === "workspace" && <ConnectedWorkspace />}
        {view === "settings" && <SettingsScreen />}
      </div>
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Wait for workspace to load", async () => {
      await waitFor(
        () => {
          expect(canvas.getByText("Unprocessed thought")).toBeInTheDocument();
        },
        { timeout: 10000 },
      );
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
      await waitFor(
        () => {
          expect(
            canvas.getByRole("main", { name: "Bucket content" }),
          ).toBeInTheDocument();
        },
        { timeout: 10000 },
      );
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
      <div className="min-h-screen bg-surface px-6 pb-6 pt-3">
        <AppHeader
          username="wolfgang"
          currentView={view}
          onNavigate={setView}
          onSignOut={fn()}
          onLogoClick={fn()}
          className="mb-6"
        />
        {view === "workspace" && <ConnectedWorkspace />}
        {view === "settings" && <SettingsScreen />}
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// MobileWithBucketNav — mobile viewport with buckets in hamburger menu
// ---------------------------------------------------------------------------

export const MobileWithBucketNav: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: function MobileShellDemo() {
    const [view, setView] = useState<AppView>("workspace");
    const [bucket, setBucket] = useState<Bucket>("inbox");

    return (
      <div className="min-h-screen bg-surface px-3 pb-3 pt-2">
        <AppHeader
          username="wolfgang"
          currentView={view}
          onNavigate={setView}
          onSignOut={fn()}
          onLogoClick={fn()}
          mobileBucketNav={{
            activeBucket: bucket,
            items: navItems,
            counts: { inbox: 3, next: 1, waiting: 1, project: 2 },
            onBucketChange: (b) => {
              setBucket(b);
              setView("workspace");
            },
          }}
          className="mb-4"
        />
        {view === "workspace" && (
          <ConnectedBucketView
            activeBucket={bucket}
            onBucketChange={setBucket}
          />
        )}
        {view === "settings" && <SettingsScreen />}
      </div>
    );
  },
  play: async ({ canvas, userEvent, step }) => {
    await step("Wait for workspace to load", async () => {
      await waitFor(
        () => {
          expect(
            canvas.getByRole("main", { name: "Bucket content" }),
          ).toBeInTheDocument();
        },
        { timeout: 10000 },
      );
    });

    await step("Open menu and see bucket items", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Main menu" }));
      await expect(canvas.getByText("Buckets")).toBeInTheDocument();
      await expect(canvas.getByText("Inbox (3)")).toBeInTheDocument();
      await expect(canvas.getByText("Next (1)")).toBeInTheDocument();
    });

    await step("Navigate to Next via hamburger menu", async () => {
      await userEvent.click(canvas.getByText("Next (1)"));
      await waitFor(
        () => {
          expect(
            canvas.getByRole("heading", { name: /Next/ }),
          ).toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    });
  },
};
