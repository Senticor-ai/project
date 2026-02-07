import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Full GTD Cycle", () => {
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

    // 2. Triage all three (FIFO: oldest first)
    // Item 1 ("Buy groceries") → Next Actions
    await ws.triageButton("Next").click();
    await expect(ws.bucketCount("Inbox")).toHaveText("2");

    // Item 2 ("Call dentist") → Waiting
    await ws.triageButton("Waiting").click();
    await expect(ws.bucketCount("Inbox")).toHaveText("1");

    // Item 3 ("Read article on testing") → Someday
    await ws.triageButton("Someday").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // 3. Navigate to Next Actions, verify "Buy groceries"
    await ws.navigateTo("Next Actions");
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
    await ws.navigateTo("Waiting For");
    await expect(page.getByText("Call dentist")).toBeVisible();

    await ws.navigateTo("Someday/Maybe");
    await expect(page.getByText("Read article on testing")).toBeVisible();
  });
});
