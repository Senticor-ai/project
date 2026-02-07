import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { AppHeader, type AppView } from "./AppHeader";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { Icon } from "@/components/ui/Icon";

// ---------------------------------------------------------------------------
// Mock workspace placeholder (stands in for ConnectedBucketView)
// ---------------------------------------------------------------------------

function MockWorkspace() {
  return (
    <div className="flex gap-6">
      <nav className="w-56 shrink-0 space-y-0.5" aria-label="Buckets">
        {[
          { label: "Inbox", icon: "inbox", count: 12 },
          { label: "Focus", icon: "center_focus_strong", count: 3 },
          { label: "Next Actions", icon: "bolt", count: 8 },
          { label: "Projects", icon: "folder", count: 5 },
          { label: "Waiting For", icon: "schedule", count: 2 },
        ].map(({ label, icon, count }) => (
          <div
            key={label}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm text-text-muted"
          >
            <Icon name={icon} size={16} className="shrink-0" />
            <span className="flex-1 text-left">{label}</span>
            <span className="rounded-full bg-paper-200 px-2 py-0.5 text-xs font-medium text-text-subtle">
              {count}
            </span>
          </div>
        ))}
      </nav>
      <main className="min-w-0 flex-1" data-testid="mock-workspace">
        <div className="rounded-[var(--radius-lg)] border border-border bg-paper-50 p-8 text-center text-text-muted">
          <Icon
            name="inbox"
            size={48}
            className="mx-auto mb-2 text-text-subtle"
          />
          <p className="text-sm">Workspace content area</p>
        </div>
      </main>
    </div>
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
        {view === "workspace" && <MockWorkspace />}
        {view === "settings" && <SettingsScreen />}
      </div>
    );
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
        {view === "workspace" && <MockWorkspace />}
        {view === "settings" && <SettingsScreen />}
      </div>
    );
  },
  play: async ({ canvas, userEvent, step }) => {
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

    await step("Verify Workspace is visible", async () => {
      await expect(canvas.getByTestId("mock-workspace")).toBeInTheDocument();
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
        {view === "workspace" && <MockWorkspace />}
        {view === "settings" && <SettingsScreen />}
      </div>
    );
  },
};
