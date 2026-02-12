import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("File split-on-triage (ReadAction)", () => {
  test("triaging DigitalDocument to Next creates ReadAction + reference split", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    // Seed a DigitalDocument inbox item (same shape as a PDF file drop)
    await apiSeed.createDigitalDocumentInboxItem("BSI-TR-03183-2.pdf", {
      encodingFormat: "application/pdf",
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    // Verify item visible in inbox
    await expect(page.getByText("BSI-TR-03183-2.pdf")).toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("1");

    // Triage to Next — should trigger split: ReadAction in Next + reference copy
    await ws.triageButton("Next").click();

    // Item should leave inbox
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // Verify it appears in Next bucket
    await ws.navigateTo("Next");
    await expect(page.getByText("BSI-TR-03183-2.pdf")).toBeVisible();

    // KEY ASSERTION: split should have created a reference copy
    await ws.navigateTo("Reference");
    await expect(page.getByText("BSI-TR-03183-2.pdf")).toBeVisible();
  });

  test("triaging DigitalDocument to Reference does NOT split (direct move)", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createDigitalDocumentInboxItem("Dokument.pdf", {
      encodingFormat: "application/pdf",
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    await expect(page.getByText("Dokument.pdf")).toBeVisible();

    // Triage directly to Reference — no split, just a move
    await ws.triageButton("Reference").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // Should appear in Reference (one copy, not duplicated)
    await ws.navigateTo("Reference");
    await expect(page.getByText("Dokument.pdf")).toBeVisible();

    // Should NOT appear in Next (no ReadAction created)
    await ws.navigateTo("Next");
    await expect(page.getByText("Dokument.pdf")).not.toBeVisible();
  });

  test("triaging regular Action to Next does NOT split", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItem("Call the office");
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    await ws.triageButton("Next").click();

    // Should appear in Next
    await ws.navigateTo("Next");
    await expect(page.getByText("Call the office")).toBeVisible();

    // Should NOT appear in Reference (no split for regular Action)
    await ws.navigateTo("Reference");
    await expect(page.getByText("Call the office")).not.toBeVisible();
  });
});
