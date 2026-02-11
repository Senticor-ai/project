import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Email Triage", () => {
  test("email item shows mail icon and sender in inbox", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createEmailInboxItem("Re: Antrag auf Verlängerung", {
      from: "h.schmidt@example.de",
      fromName: "Hans Schmidt",
    });
    await page.reload();

    const ws = new WorkspacePage(page);

    // Email item visible with subject
    await expect(page.getByText("Re: Antrag auf Verlängerung")).toBeVisible();

    // Mail icon and sender address shown
    await expect(page.getByText("h.schmidt@example.de")).toBeVisible();
    await expect(page.getByText("mail")).toBeVisible();
  });

  test("triages email item to Next", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createEmailInboxItem("Prüfbericht versenden");
    await page.reload();

    const ws = new WorkspacePage(page);

    await expect(page.getByText("Prüfbericht versenden")).toBeVisible();
    await ws.triageButton("Next").click();

    // Item gone from inbox
    await expect(page.getByText("Prüfbericht versenden")).not.toBeVisible();

    // Navigate to Next, verify it's there
    await ws.navigateTo("Next");
    await expect(page.getByText("Prüfbericht versenden")).toBeVisible();
  });

  test("triages email item to Calendar with date", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createEmailInboxItem("Termin bestätigen");
    await page.reload();

    const ws = new WorkspacePage(page);

    await expect(page.getByText("Termin bestätigen")).toBeVisible();

    // Triage to Calendar — opens date picker
    await ws.triageButton("Calendar").click();
    await page.getByLabel("Schedule date").fill("2026-04-01");

    // Item gone from inbox
    await expect(page.getByText("Termin bestätigen")).not.toBeVisible();

    // Navigate to Calendar, verify it's there
    await ws.navigateTo("Calendar");
    await expect(page.getByText("Termin bestätigen")).toBeVisible();
  });

  test("archives email item", async ({ authenticatedPage: page, apiSeed }) => {
    await apiSeed.createEmailInboxItem("Newsletter abbestellen");
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    await expect(page.getByText("Newsletter abbestellen")).toBeVisible();
    await ws.archiveButton().click();

    // Archived item disappears from inbox
    await expect(page.getByText("Newsletter abbestellen")).not.toBeVisible();
    await expect(page.getByText("0 items to process")).toBeVisible();
  });

  test("email body viewer toggle visible when expanded", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createEmailInboxItem("Wichtige Mitteilung", {
      from: "sekretariat@bund.de",
      htmlBody:
        "<p>Sehr geehrte Damen und Herren, hiermit teile ich Ihnen mit...</p>",
    });
    await page.reload();

    // Email item is auto-expanded in inbox (newest-first, first item triageable)
    await expect(page.getByText("Wichtige Mitteilung")).toBeVisible();

    // EmailBodyViewer toggle visible
    const toggle = page.getByRole("button", { name: /E-Mail anzeigen/i });
    await expect(toggle).toBeVisible();

    // Click to expand email body
    await toggle.click();
    await expect(page.getByText(/hiermit teile ich Ihnen mit/)).toBeVisible();

    // Collapse again
    const collapseToggle = page.getByRole("button", {
      name: /E-Mail ausblenden/i,
    });
    await collapseToggle.click();
    await expect(
      page.getByText(/hiermit teile ich Ihnen mit/),
    ).not.toBeVisible();
  });
});
