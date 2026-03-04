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
    await apiSeed.createProjectAction(projectId, "Design wireframes");
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
    await apiSeed.createProjectAction(projectId, "Set up CI/CD");
    await apiSeed.createProjectAction(projectId, "Implement auth");
    await apiSeed.createProjectAction(projectId, "Add push notifications");
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
    await apiSeed.createProjectAction(projectId, "Write tests");
    await apiSeed.createProjectAction(projectId, "Implement feature");
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Projects");
    await ws.projectRow("Sprint 5").click();

    // Both actions should be visible in collaboration workspace
    await expect(page.getByText("Write tests")).toBeVisible();
    await expect(page.getByText("Implement feature")).toBeVisible();
  });

  test("add action to project via rapid entry", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createProject("Q1 Goals", "Achieve quarterly targets");
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Projects");
    await ws.projectRow("Q1 Goals").click();

    // Use collaboration workspace's quick-add input (in Backlog column)
    const quickAdd = page.getByPlaceholder("Add action...");
    await quickAdd.first().fill("Define OKRs");
    await quickAdd.first().press("Enter");

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
    await apiSeed.createProjectAction(projectId, "Hidden action");
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
    await apiSeed.createProjectAction(p1, "Alpha task");
    await apiSeed.createProjectAction(p2, "Beta task");
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
