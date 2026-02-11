import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Inbox Triage", () => {
  test("triages first item to Next Actions", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItems(["Item Alpha", "Item Beta"]);
    await page.reload();

    const ws = new WorkspacePage(page);

    // First item has triage buttons
    await expect(ws.triageButton("Next")).toBeVisible();
    await expect(page.getByText("Item Alpha")).toBeVisible();

    // Triage Item Alpha to Next Actions
    await ws.triageButton("Next").click();

    // Item Alpha gone from inbox, Item Beta now triageable
    await expect(page.getByText("Item Alpha")).not.toBeVisible();
    await expect(ws.triageButton("Next")).toBeVisible();
    await expect(page.getByText("Item Beta")).toBeVisible();

    // Count should be 1
    await expect(ws.bucketCount("Inbox")).toHaveText("1");

    // Navigate to Next Actions, verify Item Alpha is there
    await ws.navigateTo("Next Actions");
    await expect(page.getByText("Item Alpha")).toBeVisible();
  });

  test("triages to different buckets", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItems([
      "Waiting item",
      "Calendar item",
      "Someday item",
      "Reference item",
    ]);
    await page.reload();

    const ws = new WorkspacePage(page);

    // Triage to Waiting — wait for count to decrease between each
    await ws.triageButton("Waiting").click();
    await expect(ws.bucketCount("Inbox")).toHaveText("3");
    // Triage to Calendar (opens date picker — fill date to complete the move)
    await ws.triageButton("Calendar").click();
    await page.getByLabel("Schedule date").fill("2026-03-01");
    await expect(ws.bucketCount("Inbox")).toHaveText("2");
    // Triage to Someday
    await ws.triageButton("Someday").click();
    await expect(ws.bucketCount("Inbox")).toHaveText("1");
    // Triage to Reference
    await ws.triageButton("Reference").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // Verify each bucket
    await ws.navigateTo("Waiting For");
    await expect(page.getByText("Waiting item")).toBeVisible();

    await ws.navigateTo("Calendar");
    await expect(page.getByText("Calendar item")).toBeVisible();

    await ws.navigateTo("Someday/Maybe");
    await expect(page.getByText("Someday item")).toBeVisible();
  });

  test("archives an inbox item", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItem("Disposable thought");
    await page.reload();

    const ws = new WorkspacePage(page);

    await expect(page.getByText("Disposable thought")).toBeVisible();
    await ws.archiveButton().click();

    await expect(page.getByText("Inbox is empty")).toBeVisible();
  });

  test("triage with expanded options (date + complexity)", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItem("Vorgang bearbeiten");
    await page.reload();

    const ws = new WorkspacePage(page);

    // Expand "More options"
    await ws.moreOptionsToggle().click();

    // Set date
    await ws.triageDateInput().fill("2026-03-01");

    // Set complexity
    await ws.complexityButton("high").click();

    // Triage to Calendar (opens inline date picker — fill to complete the move)
    await ws.triageButton("Calendar").click();
    await page.getByLabel("Schedule date").fill("2026-03-01");

    // Verify it moved to Calendar
    await ws.navigateTo("Calendar");
    await expect(page.getByText("Vorgang bearbeiten")).toBeVisible();
  });
});
