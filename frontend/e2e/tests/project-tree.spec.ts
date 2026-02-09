import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("ProjectTree", () => {
  test("shows projects when navigating to Projects bucket", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Website Redesign",
      "New site live and indexed",
    );
    await apiSeed.createAction("Design wireframes", "next", {
      projectId,
      sequenceOrder: 1,
    });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Projects");

    await expect(page.getByText("Website Redesign")).toBeVisible();
    await expect(page.getByText("1 project")).toBeVisible();
  });

  test("expand project to see sequential actions", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Mobile App",
      "App in both stores",
    );
    await apiSeed.createAction("Set up CI/CD", "next", {
      projectId,
      sequenceOrder: 1,
    });
    await apiSeed.createAction("Implement auth", "next", {
      projectId,
      sequenceOrder: 2,
    });
    await apiSeed.createAction("Add push notifications", "next", {
      projectId,
      sequenceOrder: 3,
    });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Projects");

    // Actions should be hidden initially
    await expect(page.getByText("Implement auth")).not.toBeVisible();

    // Expand the project
    await ws.projectRow("Mobile App").click();

    // All actions visible
    await expect(page.getByText("Set up CI/CD")).toBeVisible();
    await expect(page.getByText("Implement auth")).toBeVisible();
    await expect(page.getByText("Add push notifications")).toBeVisible();

    // Desired outcome visible
    await expect(page.getByText("App in both stores")).toBeVisible();
  });

  test("shows stalled indicator for project with no actions", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createProject("Empty Project", "Needs planning");
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Projects");

    await expect(page.getByText("Empty Project")).toBeVisible();
    await expect(page.getByLabel("Needs next action")).toBeVisible();
  });

  test("complete action within project", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Sprint 5",
      "All features shipped",
    );
    await apiSeed.createAction("Write tests", "next", {
      projectId,
      sequenceOrder: 1,
    });
    await apiSeed.createAction("Implement feature", "next", {
      projectId,
      sequenceOrder: 2,
    });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Projects");
    await ws.projectRow("Sprint 5").click();

    // Complete first action
    await ws.completeCheckbox("Write tests").click();

    // Action should disappear or show as completed
    // The next action should now be the "current" one
    await expect(page.getByText("Implement feature")).toBeVisible();
  });

  test("add action to project via rapid entry", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Q1 Goals",
      "Achieve quarterly targets",
    );
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Projects");
    await ws.projectRow("Q1 Goals").click();

    // Type in the project's rapid entry
    await ws.projectActionInput().fill("Define OKRs");
    await ws.projectActionInput().press("Enter");

    // New action should appear
    await expect(page.getByText("Define OKRs")).toBeVisible();
  });

  test("collapse project hides actions", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Collapsible",
      "Test collapse",
    );
    await apiSeed.createAction("Hidden action", "next", {
      projectId,
      sequenceOrder: 1,
    });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Projects");

    // Expand
    await ws.projectRow("Collapsible").click();
    await expect(page.getByText("Hidden action")).toBeVisible();

    // Collapse
    await ws.projectRow("Collapsible").click();
    await expect(page.getByText("Hidden action")).not.toBeVisible();
  });

  test("multiple projects — only one expanded at a time", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const p1 = await apiSeed.createProject("Project Alpha", "Alpha goal");
    const p2 = await apiSeed.createProject("Project Beta", "Beta goal");
    await apiSeed.createAction("Alpha task", "next", {
      projectId: p1,
      sequenceOrder: 1,
    });
    await apiSeed.createAction("Beta task", "next", {
      projectId: p2,
      sequenceOrder: 1,
    });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Projects");

    // Expand Alpha
    await ws.projectRow("Project Alpha").click();
    await expect(page.getByText("Alpha task")).toBeVisible();

    // Expand Beta — Alpha should collapse
    await ws.projectRow("Project Beta").click();
    await expect(page.getByText("Beta task")).toBeVisible();
    await expect(page.getByText("Alpha task")).not.toBeVisible();
  });

  test("empty state when no projects exist", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Projects");

    await expect(page.getByText("No active projects")).toBeVisible();
  });
});
