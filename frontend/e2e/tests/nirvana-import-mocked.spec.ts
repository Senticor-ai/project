import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../fixtures/auth.fixture";
import { SettingsPage } from "../pages/settings.page";
import { mockNirvanaImportApi } from "../helpers/mock-import-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NIRVANA_FIXTURE = path.resolve(
  __dirname,
  "../fixtures/nirvana-small.json",
);

/**
 * Mocked integration tests for the Nirvana import flow.
 *
 * Only the file-upload and import endpoints are mocked via page.route().
 * Auth, orgs, and items use the real backend so the app renders normally.
 * This catches regressions in the import dialog UI without a fragile
 * full-mock setup.
 */

test.describe("Nirvana Import (mocked)", () => {
  test("uploads file, shows preview, imports, and shows results", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(30_000);

    const settings = new SettingsPage(page);
    await settings.openSettings();

    // Install mocks after app is loaded to avoid interfering with page rendering
    await mockNirvanaImportApi(page, { itemCount: 7 });

    // Open import dialog
    await settings.importNirvanaButton().click();
    await expect(
      page.getByText("Drop your Nirvana JSON export file"),
    ).toBeVisible();

    // Upload fixture file
    const fileInput = page.getByTestId("nirvana-file-input");
    await fileInput.setInputFiles(NIRVANA_FIXTURE);

    // Wait for upload → preview transition
    await expect(page.getByText(/^\d+ items found$/)).toBeVisible({
      timeout: 15_000,
    });

    // Verify preview content
    const previewText = await page.getByText(/^\d+ items found$/).textContent();
    expect(previewText).toBeTruthy();
    const itemCount = parseInt(previewText!.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(itemCount).toBeGreaterThan(0);

    // "Include completed items" checkbox should exist
    await expect(page.getByLabel("Include completed items")).toBeVisible();

    // Click the Import button
    const importButton = page.getByRole("button", {
      name: /Import \d+ items/,
    });
    await expect(importButton).toBeVisible();
    await importButton.click();

    // Wait for import to complete
    await expect(page.getByText("Import complete")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("shows error state when upload fails", async ({
    authenticatedPage: page,
  }) => {
    const settings = new SettingsPage(page);
    await settings.openSettings();

    // Install mocks after app is loaded — initiate returns 500
    await mockNirvanaImportApi(page, {
      itemCount: 7,
      initiateStatus: 500,
    });
    await settings.importNirvanaButton().click();

    const fileInput = page.getByTestId("nirvana-file-input");
    await fileInput.setInputFiles(NIRVANA_FIXTURE);

    // Should show upload error
    await expect(page.getByText(/Upload failed/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
