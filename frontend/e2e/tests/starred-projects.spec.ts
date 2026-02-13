import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Starred Projects in BucketNav", () => {
  test("star a project and verify it appears in nav sidebar", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createProject("Steuererklärung 2025", "File by deadline");
    await page.reload();

    const ws = new WorkspacePage(page);

    // Initially project should NOT be in nav sidebar (not starred)
    await expect(
      ws.navProjectSubItem("Steuererklärung 2025"),
    ).not.toBeVisible();

    // Navigate to Projects, expand project, click star
    await ws.navigateTo("Projects");
    await ws.projectRow("Steuererklärung 2025").click();
    await ws.projectStar("Steuererklärung 2025").click();

    // After starring, project should appear in BucketNav sidebar
    await expect(ws.navProjectSubItem("Steuererklärung 2025")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("unstar a project removes it from nav sidebar", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    // Create starred project via API
    await apiSeed.createProject("Quick Project", "Get it done", {
      isFocused: true,
    });
    await page.reload();

    const ws = new WorkspacePage(page);

    // Starred project should appear in nav sidebar
    await expect(ws.navProjectSubItem("Quick Project")).toBeVisible({
      timeout: 10_000,
    });

    // Navigate to Projects, expand, click unstar
    await ws.navigateTo("Projects");
    await ws.projectRow("Quick Project").click();
    await ws.projectStar("Quick Project").click();

    // Project should disappear from nav sidebar
    await expect(ws.navProjectSubItem("Quick Project")).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test("starred project visible in nav on page load", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    // Seed a starred project via API
    await apiSeed.createProject("Büro-Umzug", "New office ready", {
      isFocused: true,
    });
    await page.reload();

    const ws = new WorkspacePage(page);

    // Project should be visible in nav sidebar immediately after load
    await expect(ws.navProjectSubItem("Büro-Umzug")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("non-starred project does NOT appear in nav sidebar", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createProject("Hidden Project", "Stays hidden", {
      isFocused: false,
    });
    await page.reload();

    const ws = new WorkspacePage(page);

    // Wait for nav to be ready
    await expect(ws.bucketNav).toBeVisible();

    // Non-starred project should not appear as sub-item
    await expect(ws.navProjectSubItem("Hidden Project")).not.toBeVisible();
  });
});
