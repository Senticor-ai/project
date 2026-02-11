import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Rapid Entry", () => {
  test("adds an action via rapid entry in Next", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next");

    await ws.addRapidEntry("Quick task from rapid entry");

    await expect(page.getByText("Quick task from rapid entry")).toBeVisible();
    await expect(ws.rapidEntryInput()).toHaveValue("");
  });

  test("adds multiple actions via rapid entry", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next");

    await ws.addRapidEntry("Task A");
    await ws.addRapidEntry("Task B");
    await ws.addRapidEntry("Task C");

    await expect(page.getByText("Task A")).toBeVisible();
    await expect(page.getByText("Task B")).toBeVisible();
    await expect(page.getByText("Task C")).toBeVisible();
    await expect(page.getByText("3 actions")).toBeVisible();
  });

  test("rapid entry not visible in Focus view", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Focus");

    await expect(ws.rapidEntryInput()).not.toBeVisible();
  });

  test("rapid entry works in other buckets", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Waiting");

    await ws.addRapidEntry("Waiting task via rapid entry");

    await expect(
      page.getByText("Waiting task via rapid entry"),
    ).toBeVisible();
    await expect(ws.bucketCount("Waiting")).toHaveText("1");
  });
});
