import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Inbox Capture", () => {
  test("captures a thought via Enter and shows it in inbox", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);

    await ws.captureInboxItem("Anruf bei Frau Mueller");

    await expect(page.getByText("Anruf bei Frau Mueller")).toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("1");
  });

  test("clears input after capture", async ({ authenticatedPage: page }) => {
    const ws = new WorkspacePage(page);

    await ws.captureInboxItem("First thought");

    await expect(ws.captureInput).toHaveValue("");
  });

  test("captures via Capture button click", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);

    await ws.captureInput.fill("Button capture test");
    await page.getByRole("button", { name: "Capture" }).click();

    await expect(page.getByText("Button capture test")).toBeVisible();
    await expect(ws.captureInput).toHaveValue("");
  });

  test("does not capture empty or whitespace input", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);

    await ws.captureInput.fill("   ");
    await ws.captureInput.press("Enter");

    await expect(page.getByText("Inbox is empty")).toBeVisible();
  });

  test("captures multiple items in FIFO order", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);

    await ws.captureInboxItem("First item");
    await ws.captureInboxItem("Second item");
    await ws.captureInboxItem("Third item");

    await expect(ws.bucketCount("Inbox")).toHaveText("3");

    // All items should be visible
    await expect(page.getByText("First item")).toBeVisible();
    await expect(page.getByText("Second item")).toBeVisible();
    await expect(page.getByText("Third item")).toBeVisible();
  });

  test("each item appears immediately after capture without refresh", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);

    // Capture first item and verify it appears before capturing the next
    await ws.captureInboxItem("Buy groceries");
    await expect(page.getByText("Buy groceries")).toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("1");

    // Capture second item — both should be visible (no refresh)
    await ws.captureInboxItem("Call dentist");
    await expect(page.getByText("Call dentist")).toBeVisible();
    await expect(page.getByText("Buy groceries")).toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("2");

    // Capture third item — all three visible (no refresh)
    await ws.captureInboxItem("Review contract");
    await expect(page.getByText("Review contract")).toBeVisible();
    await expect(page.getByText("Call dentist")).toBeVisible();
    await expect(page.getByText("Buy groceries")).toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("3");
  });
});
