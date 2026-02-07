import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("ContextFilterBar", () => {
  test("shows context chips when actions have contexts", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createAction("Call boss", "next", {
      contexts: ["@phone"],
    });
    await apiSeed.createAction("Write report", "next", {
      contexts: ["@computer"],
    });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next Actions");

    // Context filter bar should appear with both context chips
    await expect(ws.contextFilterBar()).toBeVisible();
    await expect(ws.contextChip("@phone")).toBeVisible();
    await expect(ws.contextChip("@computer")).toBeVisible();
  });

  test("filters actions by clicking a context chip", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createAction("Call client", "next", {
      contexts: ["@phone"],
    });
    await apiSeed.createAction("Draft email", "next", {
      contexts: ["@computer"],
    });
    await apiSeed.createAction("Text team", "next", {
      contexts: ["@phone"],
    });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next Actions");

    // All 3 actions visible initially
    await expect(page.getByText("Call client")).toBeVisible();
    await expect(page.getByText("Draft email")).toBeVisible();
    await expect(page.getByText("Text team")).toBeVisible();

    // Click @phone filter
    await ws.contextChip("@phone").click();

    // Only @phone actions visible
    await expect(page.getByText("Call client")).toBeVisible();
    await expect(page.getByText("Text team")).toBeVisible();
    await expect(page.getByText("Draft email")).not.toBeVisible();
  });

  test("OR logic: multiple contexts show union", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createAction("Phone task", "next", {
      contexts: ["@phone"],
    });
    await apiSeed.createAction("Computer task", "next", {
      contexts: ["@computer"],
    });
    await apiSeed.createAction("Office task", "next", {
      contexts: ["@office"],
    });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next Actions");

    // Select @phone and @computer
    await ws.contextChip("@phone").click();
    await ws.contextChip("@computer").click();

    // Phone and computer visible, office hidden
    await expect(page.getByText("Phone task")).toBeVisible();
    await expect(page.getByText("Computer task")).toBeVisible();
    await expect(page.getByText("Office task")).not.toBeVisible();
  });

  test("Clear button resets filter to show all actions", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createAction("Phone task", "next", {
      contexts: ["@phone"],
    });
    await apiSeed.createAction("Computer task", "next", {
      contexts: ["@computer"],
    });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next Actions");

    // Filter to @phone only
    await ws.contextChip("@phone").click();
    await expect(page.getByText("Computer task")).not.toBeVisible();

    // Clear filter
    await ws.clearContextFilters().click();

    // Both visible again
    await expect(page.getByText("Phone task")).toBeVisible();
    await expect(page.getByText("Computer task")).toBeVisible();
  });

  test("no filter bar when actions have no contexts", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createAction("Plain task", "next");
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next Actions");

    await expect(page.getByText("Plain task")).toBeVisible();
    await expect(ws.contextFilterBar()).not.toBeVisible();
  });
});
