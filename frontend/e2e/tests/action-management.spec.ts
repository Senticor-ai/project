import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Action Management", () => {
  test("complete an action", async ({ authenticatedPage: page, apiSeed }) => {
    await apiSeed.createAction("Write report", "next");
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next Actions");

    await expect(page.getByText("Write report")).toBeVisible();

    // Complete the action
    await ws.completeCheckbox("Write report").click();

    // Completed actions are filtered out of the active list
    await expect(page.getByText("Write report")).not.toBeVisible();
  });

  test("toggle focus and verify in Focus view", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createAction("Prepare slides", "next");
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next Actions");

    // Focus the action
    await ws.focusStar("Prepare slides").click();

    // Navigate to Focus
    await ws.navigateTo("Focus");
    await expect(page.getByText("Prepare slides")).toBeVisible();

    // Unfocus from Focus view
    await ws.focusStar("Prepare slides").click();
    await expect(page.getByText("Prepare slides")).not.toBeVisible();
    await expect(page.getByText("No focused actions")).toBeVisible();
  });

  test("move action to different bucket via menu", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createAction("Review contract", "next");
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next Actions");

    await expect(page.getByText("Review contract")).toBeVisible();

    // Open the move menu (need to hover first to reveal the button)
    await page.getByText("Review contract").hover();
    await ws.moveMenuButton("Review contract").click();

    // Move to Waiting
    await ws.moveMenuItem("Waiting").click();

    // Action should be gone from Next Actions
    await expect(page.getByText("Review contract")).not.toBeVisible();

    // Navigate to Waiting For, verify it's there
    await ws.navigateTo("Waiting For");
    await expect(page.getByText("Review contract")).toBeVisible();
  });
});
