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
    // Inbox always auto-expands the newest item (sorted[0] in descending-
    // by-createdAt sort). After triaging it, auto-advance picks the newest
    // remaining item.
    //
    // Triage order (newest first): Read article on testing → Call dentist → Buy groceries
    // Wait for each item to disappear before checking count (avoids flaky timing)
    await ws.triageButton("Next").click();
    await expect(page.getByText("Read article on testing")).not.toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("2", {
      timeout: 10_000,
    });

    await ws.triageButton("Waiting").click();
    await expect(page.getByText("Call dentist")).not.toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("1", {
      timeout: 10_000,
    });

    await ws.triageButton("Later").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // 3. Navigate to Next, verify "Read article on testing"
    await ws.navigateTo("Next");
    await expect(page.getByText("Read article on testing")).toBeVisible();

    // 4. Star it (focus)
    await ws.focusStar("Read article on testing").click();

    // Verify in Focus view
    await ws.navigateTo("Focus");
    await expect(page.getByText("Read article on testing")).toBeVisible();

    // 5. Complete it
    await ws.completeCheckbox("Read article on testing").click();
    await expect(page.getByText("Read article on testing")).not.toBeVisible();

    // 6. Verify other buckets
    await ws.navigateTo("Waiting");
    await expect(page.getByText("Call dentist")).toBeVisible();

    await ws.navigateTo("Later");
    await expect(page.getByText("Buy groceries")).toBeVisible();
  });
});
