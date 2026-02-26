import type { Page, Locator } from "@playwright/test";

// Tab labels must match SettingsScreen tab definitions in SettingsScreen.tsx
const TAB_LABELS: Record<string, string> = {
  "import-export": "Import / Export",
  email: "3rd Party Sync",
  labels: "Labels & Contexts",
  organizations: "Organizations",
  preferences: "Preferences",
  "agent-setup": "Agent Setup",
  developer: "Developer",
};

export class SettingsPage {
  readonly menuButton: Locator;

  constructor(private page: Page) {
    this.menuButton = page.getByRole("button", { name: "Main menu" });
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /** Navigate to settings via the hamburger menu. */
  async openSettings() {
    await this.menuButton.click();
    await this.page.getByRole("menuitem", { name: "Settings" }).click();
  }

  /** Navigate back to workspace via the hamburger menu. */
  async openWorkspace() {
    await this.menuButton.click();
    await this.page.getByRole("menuitem", { name: "Workspace" }).click();
  }

  /** Click a settings tab by its id. */
  async navigateToTab(
    tab:
      | "import-export"
      | "email"
      | "labels"
      | "organizations"
      | "preferences"
      | "agent-setup"
      | "developer",
  ) {
    const label = TAB_LABELS[tab];
    await this.page.getByRole("tab", { name: label }).click();
  }

  // ---------------------------------------------------------------------------
  // Import / Export tab
  // ---------------------------------------------------------------------------

  importNirvanaButton(): Locator {
    return this.page.getByRole("button", { name: "Import from Nirvana" });
  }

  exportJsonButton(): Locator {
    return this.page.getByRole("button", { name: "Export JSON" });
  }

  includeArchivedCheckbox(): Locator {
    return this.page.getByLabel("Include archived");
  }

  includeCompletedCheckbox(): Locator {
    return this.page.getByLabel("Include completed");
  }

  recentImportsHeading(): Locator {
    return this.page.getByText("Recent imports");
  }

  // ---------------------------------------------------------------------------
  // Organizations tab
  // ---------------------------------------------------------------------------

  addOrgButton(): Locator {
    return this.page.getByRole("button", { name: /add organization/i });
  }

  orgNameInput(): Locator {
    return this.page.getByPlaceholderText(/organization name/i);
  }

  // ---------------------------------------------------------------------------
  // Developer tab
  // ---------------------------------------------------------------------------

  flushButton(): Locator {
    return this.page.getByRole("button", { name: /flush all data/i });
  }

  flushConfirmInput(): Locator {
    return this.page.getByPlaceholderText(/FLUSH/);
  }

  // ---------------------------------------------------------------------------
  // Agent Setup tab
  // ---------------------------------------------------------------------------

  agentSaveButton(): Locator {
    return this.page.getByRole("button", { name: /save/i });
  }
}
