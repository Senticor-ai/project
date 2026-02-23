import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Full Cycle", () => {
  test("capture → triage → manage → complete", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);

    // 1. Capture 3 items
    await ws.captureInboxItem("Buy groceries");
    await expect(page.getByText("Buy groceries")).toBeVisible();

    await ws.captureInboxItem("Call dentist");
    await expect(page.getByText("Call dentist")).toBeVisible();

    await ws.captureInboxItem("Read article on testing");
    await expect(page.getByText("Read article on testing")).toBeVisible();

    // Inbox count should be 3
    await expect(ws.bucketCount("Inbox")).toHaveText("3");

    // 2. Triage all three
    // "Buy groceries" was captured first and auto-expanded; it scopilots expanded
    // even as newer items are added. After triaging it, auto-advance picks the
    // newest remaining item (sorted[0] in descending-by-createdAt sort).
    //
    // Triage order: Buy groceries → Read article on testing → Call dentist
    // Wait for each item to disappear before checking count (avoids flaky timing)
    await ws.triageButton("Next").click();
    await expect(page.getByText("Buy groceries")).not.toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("2", {
      timeout: 10_000,
    });

    await ws.triageButton("Waiting").click();
    await expect(page.getByText("Read article on testing")).not.toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("1", {
      timeout: 10_000,
    });

    await ws.triageButton("Later").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // 3. Navigate to Next, verify "Buy groceries"
    await ws.navigateTo("Next");
    await expect(page.getByText("Buy groceries")).toBeVisible();

    // 4. Star it (focus)
    await ws.focusStar("Buy groceries").click();

    // Verify in Focus view
    await ws.navigateTo("Focus");
    await expect(page.getByText("Buy groceries")).toBeVisible();

    // 5. Complete it
    await ws.completeCheckbox("Buy groceries").click();
    await expect(page.getByText("Buy groceries")).not.toBeVisible();

    // 6. Verify other buckets
    // "Read article on testing" was auto-advanced (newest remaining) → Waiting
    await ws.navigateTo("Waiting");
    await expect(page.getByText("Read article on testing")).toBeVisible();

    // "Call dentist" was the last remaining → Later
    await ws.navigateTo("Later");
    await expect(page.getByText("Call dentist")).toBeVisible();
  });
});
