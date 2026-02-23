import type { Page, Locator } from "@playwright/test";

export class WorkspacePage {
  readonly menuTrigger: Locator;
  readonly signOutMenuItem: Locator;
  readonly captureInput: Locator;
  readonly bucketNav: Locator;
  readonly contentArea: Locator;

  constructor(private page: Page) {
    this.menuTrigger = page.getByRole("button", { name: "Main menu" });
    this.signOutMenuItem = page.getByRole("menuitem", { name: "Sign out" });
    this.captureInput = page.getByLabel("Capture a thought");
    this.bucketNav = page.getByRole("navigation", { name: "Buckets" });
    this.contentArea = page.getByRole("main", { name: "Bucket content" });
  }

  async signOut() {
    await this.menuTrigger.click();
    await this.signOutMenuItem.click();
  }

  // ----- Navigation -----

  async navigateTo(bucket: string) {
    // Desktop (>=768px): sidebar BucketNav is visible (md:block)
    // Mobile (<768px): sidebar is hidden, navigate via AppMenu
    const viewport = this.page.viewportSize();
    const isMobile = (viewport?.width ?? 1280) < 768;

    if (isMobile) {
      await this.menuTrigger.click();
      await this.page
        .getByRole("menuitem", { name: new RegExp(bucket) })
        .click();
    } else {
      await this.bucketNav.getByRole("button", { name: bucket }).click();
    }
  }

  activeBucket(): Locator {
    return this.bucketNav.locator('[aria-current="page"]');
  }

  bucketCount(bucket: string): Locator {
    return this.bucketNav
      .getByRole("button", { name: bucket })
      .locator("span.rounded-full");
  }

  // ----- Inbox -----

  async captureInboxItem(text: string) {
    await this.captureInput.fill(text);
    await this.captureInput.press("Enter");
  }

  // ----- Triage buttons -----

  triageButton(label: string): Locator {
    return this.page.getByRole("button", {
      name: `Move to ${label}`,
      exact: true,
    });
  }

  archiveButton(): Locator {
    return this.page.getByRole("button", { name: "Archive", exact: true });
  }

  moreOptionsToggle(): Locator {
    return this.page.getByRole("button", {
      name: /More options|Less options/,
    });
  }

  // ----- Triage expanded options -----

  triageDateInput(): Locator {
    return this.page.getByLabel("Date");
  }

  complexityButton(level: string): Locator {
    return this.page.getByRole("button", { name: level, exact: true });
  }

  // ----- Action List -----

  rapidEntryInput(): Locator {
    return this.page.getByRole("textbox", { name: "Rapid entry" });
  }

  async addRapidEntry(text: string) {
    await this.rapidEntryInput().fill(text);
    await this.rapidEntryInput().press("Enter");
  }

  completeCheckbox(title: string): Locator {
    return this.page.getByLabel(`Complete ${title}`);
  }

  focusStar(title: string): Locator {
    return this.page.getByLabel(new RegExp(`(Focus|Unfocus) ${title}`));
  }

  moveMenuButton(title: string): Locator {
    return this.page.getByLabel(`Move ${title}`);
  }

  moveMenuItem(bucket: string): Locator {
    return this.page.getByRole("menuitem", { name: `Move to ${bucket}` });
  }

  // ----- Multi-select & Batch Actions -----

  /** Click to select an item (Explorer-style exclusive select). */
  async selectItem(title: string) {
    await this.page.getByText(title, { exact: true }).click();
  }

  /** Cmd/Ctrl+Click to toggle additive selection on an item. */
  async cmdClickItem(title: string) {
    const additiveModifier: "Meta" | "Control" =
      process.platform === "darwin" ? "Meta" : "Control";
    await this.page
      .getByText(title, { exact: true })
      .click({ modifiers: [additiveModifier] });
  }

  /** Shift+Click for range selection from last selected to this item. */
  async shiftClickItem(title: string) {
    await this.page
      .getByText(title, { exact: true })
      .click({ modifiers: ["Shift"] });
  }

  batchBar(): Locator {
    return this.page.getByRole("toolbar", { name: "Batch actions" });
  }

  batchTriageButton(label: string): Locator {
    return this.batchBar().getByLabel(`Batch move to ${label}`);
  }

  batchArchiveButton(): Locator {
    return this.batchBar().getByLabel("Batch archive");
  }

  batchProjectPicker(): Locator {
    return this.batchBar().getByLabel("Move batch to project");
  }

  batchSelectAll(): Locator {
    return this.batchBar().getByLabel("Select all");
  }

  batchClear(): Locator {
    return this.batchBar().getByLabel("Clear selection");
  }

  // ----- Project star toggle -----

  projectStar(title: string): Locator {
    return this.page.getByLabel(new RegExp(`(Star|Unstar) ${title}`));
  }

  // ----- Starred projects in nav -----

  navProjectSubItem(name: string): Locator {
    return this.bucketNav.getByLabel(`Drop into ${name}`);
  }

  // ----- Context Filter Bar -----

  contextFilterBar(): Locator {
    return this.page.getByRole("group", { name: "Filter by context" });
  }

  contextChip(context: string): Locator {
    return this.contextFilterBar().getByRole("checkbox", {
      name: new RegExp(context),
    });
  }

  clearContextFilters(): Locator {
    return this.page.getByLabel("Clear context filters");
  }

  // ----- Project Tree -----

  projectRow(title: string): Locator {
    return this.page.getByLabel(new RegExp(`(Expand|Collapse) ${title}`));
  }

  projectActionInput(): Locator {
    return this.page.getByPlaceholder(/add action to project/i);
  }
}
