import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../fixtures/auth.fixture";
import { SettingsPage } from "../pages/settings.page";
import { WorkspacePage } from "../pages/workspace.page";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NIRVANA_EXPORT_PATH = path.resolve(
  __dirname,
  "../../../tmp/Nirvana_Export_1770390824.json",
);

const fixtureExists = fs.existsSync(NIRVANA_EXPORT_PATH);

test.describe("Nirvana Import", () => {
  // Skip the entire suite when the large export fixture is not present (e.g. CI)
  test.skip(!fixtureExists, "Nirvana export fixture not found — skipping");

  test("uploads file, previews, imports, and shows results", async ({
    authenticatedPage: page,
  }) => {
    // Generous timeout for a 12 MB / 20k item import
    test.setTimeout(180_000);

    // 1. Open import dialog via Settings
    const settings = new SettingsPage(page);
    await settings.openSettings();
    await settings.importNirvanaButton().click();
    await expect(
      page.getByText("Drop your Nirvana JSON export file"),
    ).toBeVisible();

    // 2. Upload the real Nirvana export file
    const fileInput = page.getByTestId("nirvana-file-input");
    await fileInput.setInputFiles(NIRVANA_EXPORT_PATH);

    // 3. Wait for uploading → preview transition
    await expect(page.getByText("Uploading file...")).toBeVisible();
    await expect(page.getByText(/\d+ items found/)).toBeVisible({
      timeout: 60_000,
    });

    // 4. Verify preview shows bucket breakdown and item count
    const previewText = await page.getByText(/\d+ items found/).textContent();
    expect(previewText).toBeTruthy();
    const itemCount = parseInt(previewText!.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(itemCount).toBeGreaterThan(0);

    // 5. "Include completed items" should be checked by default
    await expect(page.getByLabel("Include completed items")).toBeChecked();

    // 6. Click the Import button
    const importButton = page.getByRole("button", {
      name: /Import \d+ items/,
    });
    await expect(importButton).toBeVisible();
    await importButton.click();

    // 7. Wait for the actual backend job to complete.
    //    The dialog shows results immediately with inspect preview data,
    //    then updates when the job finishes. The "By bucket" section and
    //    "Import complete" are shown in both cases. We wait for the Created
    //    count font-mono span to show a non-zero value (inspect returns 0).
    await expect(page.getByText("Import complete")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText("By bucket")).toBeVisible();

    // Verify the Created count is non-zero (confirms real job results,
    // not just the inspect preview which shows created=0).
    // "Created" and the number are sibling spans inside a div.
    const createdValue = page
      .locator("div")
      .filter({ hasText: "Created" })
      .locator("span.font-mono")
      .first();
    await expect(async () => {
      const text = await createdValue.textContent();
      expect(parseInt(text ?? "0", 10)).toBeGreaterThan(0);
    }).toPass({ timeout: 120_000 });

    // 8. Close dialog
    await page.getByRole("button", { name: "Close" }).click();

    // 9. Reload to pick up imported items (dialog unmount stops polling
    //    before invalidateQueries can propagate the refetch)
    await page.reload();
    await page.waitForSelector("text=terminandoyo", { timeout: 10_000 });

    // 10. Navigate to Next — should have items from the import
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next");
    await expect(ws.bucketCount("Next")).toBeVisible({
      timeout: 30_000,
    });
  });
});
