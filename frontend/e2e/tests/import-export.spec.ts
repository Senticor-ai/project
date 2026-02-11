import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../fixtures/auth.fixture";
import { SettingsPage } from "../pages/settings.page";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NIRVANA_FIXTURE = path.resolve(
  __dirname,
  "../fixtures/nirvana-small.json",
);

// ---------------------------------------------------------------------------
// Import Flow
// ---------------------------------------------------------------------------

test.describe("Import from Settings", () => {
  test("navigates to settings, uploads fixture, previews, and imports", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60_000);

    const settings = new SettingsPage(page);

    // 1. Navigate to Settings via hamburger menu
    await settings.openSettings();
    await expect(settings.importNirvanaButton()).toBeVisible();

    // 2. Click import button to open dialog
    await settings.importNirvanaButton().click();
    await expect(
      page.getByText("Drop your Nirvana JSON export file"),
    ).toBeVisible();

    // 3. Upload fixture file
    const fileInput = page.getByTestId("nirvana-file-input");
    await fileInput.setInputFiles(NIRVANA_FIXTURE);

    // 4. Wait for upload → preview transition
    await expect(page.getByText(/^\d+ items found$/)).toBeVisible({
      timeout: 30_000,
    });

    // 5. Verify preview content
    const previewText = await page.getByText(/^\d+ items found$/).textContent();
    expect(previewText).toBeTruthy();
    const itemCount = parseInt(previewText!.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(itemCount).toBeGreaterThan(0);

    // 6. "Include completed items" checkbox should exist
    await expect(page.getByLabel("Include completed items")).toBeVisible();

    // 7. Click the Import button
    const importButton = page.getByRole("button", {
      name: /Import \d+ items/,
    });
    await expect(importButton).toBeVisible();
    await importButton.click();

    // 8. Wait for import to complete
    await expect(page.getByText("Import complete")).toBeVisible({
      timeout: 30_000,
    });

    // 9. Close the dialog
    await page.getByRole("button", { name: "Done" }).click();

    // 10. Verify import job appears in Recent imports
    await expect(settings.recentImportsHeading()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Completed")).toBeVisible();
  });

  test("shows duplicate warning on re-import of same file", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);

    const settings = new SettingsPage(page);

    // --- First import ---
    await settings.openSettings();
    await settings.importNirvanaButton().click();
    const fileInput = page.getByTestId("nirvana-file-input");
    await fileInput.setInputFiles(NIRVANA_FIXTURE);
    await expect(page.getByText(/^\d+ items found$/)).toBeVisible({
      timeout: 30_000,
    });
    const importButton = page.getByRole("button", {
      name: /Import \d+ items/,
    });
    await importButton.click();
    await expect(page.getByText("Import complete")).toBeVisible({
      timeout: 30_000,
    });
    // Close dialog after first import
    await page.getByRole("button", { name: "Done" }).click();

    // Wait for import jobs to refetch so checkDuplicate has data
    await expect(settings.recentImportsHeading()).toBeVisible({
      timeout: 10_000,
    });

    // --- Second import of same file ---
    await settings.importNirvanaButton().click();
    await expect(
      page.getByText("Drop your Nirvana JSON export file"),
    ).toBeVisible();

    // Re-upload same fixture — expect duplicate warning
    const fileInput2 = page.getByTestId("nirvana-file-input");
    await fileInput2.setInputFiles(NIRVANA_FIXTURE);
    await expect(page.getByText(/^\d+ items found$/)).toBeVisible({
      timeout: 30_000,
    });

    // Should see duplicate warning
    await expect(
      page.getByRole("alert").filter({ hasText: "already imported" }),
    ).toBeVisible();
    await expect(
      page.getByText("This file was already imported"),
    ).toBeVisible();

    // Can click "Import anyway" to proceed
    await page.getByRole("button", { name: "Import anyway" }).click();
    await expect(page.getByRole("alert")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Export Flow
// ---------------------------------------------------------------------------

test.describe("Export from Settings", () => {
  test("exports JSON with seeded data", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    // Seed some items
    await apiSeed.createInboxItem("Buy milk");
    await apiSeed.createAction("Call dentist", "next");

    const settings = new SettingsPage(page);
    await settings.openSettings();

    // Wait for export buttons
    await expect(settings.exportJsonButton()).toBeVisible();

    // Click JSON export and capture download
    const downloadPromise = page.waitForEvent("download");
    await settings.exportJsonButton().click();
    const download = await downloadPromise;

    // Verify download filename pattern
    expect(download.suggestedFilename()).toMatch(
      /items-export-\d{8}T\d{6}Z\.json/,
    );

    // Read and verify content
    const content = await download.path();
    expect(content).toBeTruthy();
  });
});
