import type { Page, Locator } from "@playwright/test";

export class SettingsPage {
  readonly menuButton: Locator;

  constructor(private page: Page) {
    this.menuButton = page.getByRole("button", { name: "Main menu" });
  }

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

  /** Click "Import from Nirvana" button (opens the import dialog). */
  importNirvanaButton(): Locator {
    return this.page.getByRole("button", { name: "Import from Nirvana" });
  }

  /** Export JSON button. */
  exportJsonButton(): Locator {
    return this.page.getByRole("button", { name: "Export JSON" });
  }

  /** Include archived checkbox. */
  includeArchivedCheckbox(): Locator {
    return this.page.getByLabel("Include archived");
  }

  /** Include completed checkbox. */
  includeCompletedCheckbox(): Locator {
    return this.page.getByLabel("Include completed");
  }

  /** Recent imports section heading. */
  recentImportsHeading(): Locator {
    return this.page.getByText("Recent imports");
  }
}
