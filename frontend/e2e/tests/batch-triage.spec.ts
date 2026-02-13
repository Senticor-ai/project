import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Batch Triage", () => {
  test("select two items and batch triage to Next", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    // Seed 3 inbox items (oldest first, newest = "Item C")
    await apiSeed.createInboxItems(["Item A", "Item B", "Item C"]);
    await page.reload();

    const ws = new WorkspacePage(page);

    // Wait for inbox to load — newest first: C, B, A
    await expect(page.getByText("Item C")).toBeVisible();
    await expect(page.getByText("Item B")).toBeVisible();
    await expect(page.getByText("Item A")).toBeVisible();

    // Click first item to select, Cmd+Click to add second
    await ws.selectItem("Item B");
    await ws.cmdClickItem("Item A");

    // Batch bar should appear with "2 selected"
    await expect(ws.batchBar()).toBeVisible();
    await expect(ws.batchBar().getByText("2 selected")).toBeVisible();

    // Batch triage to Next
    await ws.batchTriageButton("Next").click();

    // Item B and A gone from inbox, Item C remains
    await expect(page.getByText("Item B")).not.toBeVisible();
    await expect(page.getByText("Item A")).not.toBeVisible();
    await expect(page.getByText("Item C")).toBeVisible();

    // Batch bar should be gone
    await expect(ws.batchBar()).not.toBeVisible();

    // Inbox count should be 1
    await expect(ws.bucketCount("Inbox")).toHaveText("1", {
      timeout: 10_000,
    });

    // Navigate to Next, verify both items arrived
    await ws.navigateTo("Next");
    await expect(page.getByText("Item B")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Item A")).toBeVisible();
  });

  test("select all and batch triage to Waiting", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItems(["Alpha", "Beta", "Gamma"]);
    await page.reload();

    const ws = new WorkspacePage(page);

    // Wait for items
    await expect(page.getByText("Gamma")).toBeVisible();

    // Click one to reveal batch bar, then "Select all"
    await ws.selectItem("Gamma");
    await expect(ws.batchBar()).toBeVisible();
    await ws.batchSelectAll().click();

    // Should show 3 selected
    await expect(ws.batchBar().getByText("3 selected")).toBeVisible();

    // Batch triage to Waiting
    await ws.batchTriageButton("Waiting").click();

    // Inbox should be empty
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // Navigate to Waiting, verify all 3 items
    await ws.navigateTo("Waiting");
    await expect(page.getByText("Alpha")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Beta")).toBeVisible();
    await expect(page.getByText("Gamma")).toBeVisible();
  });

  test("batch triage with project assignment", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Steuererklärung 2025",
      "File taxes by deadline",
    );
    await apiSeed.createInboxItems([
      "Scan Belege",
      "Upload Kontoauszüge",
      "Unrelated task",
    ]);
    await page.reload();

    const ws = new WorkspacePage(page);

    // Wait for inbox items
    await expect(page.getByText("Unrelated task")).toBeVisible();

    // Click first, Cmd+Click to add second
    await ws.selectItem("Scan Belege");
    await ws.cmdClickItem("Upload Kontoauszüge");

    // Pick the project in the batch dropdown — auto-moves to "next" + project
    await ws
      .batchProjectPicker()
      .selectOption({ label: "Steuererklärung 2025" });

    // Items gone from inbox
    await expect(page.getByText("Scan Belege")).not.toBeVisible();
    await expect(page.getByText("Upload Kontoauszüge")).not.toBeVisible();
    // Unrelated task still in inbox
    await expect(page.getByText("Unrelated task")).toBeVisible();

    // Navigate to Projects, expand, verify actions assigned
    await ws.navigateTo("Projects");
    await expect(page.getByText("Steuererklärung 2025")).toBeVisible();
    await ws.projectRow("Steuererklärung 2025").click();
    await expect(page.getByText("Scan Belege")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Upload Kontoauszüge")).toBeVisible();
  });

  test("clear selection hides batch bar", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItems(["Task One", "Task Two"]);
    await page.reload();

    const ws = new WorkspacePage(page);

    await expect(page.getByText("Task Two")).toBeVisible();

    // Click first, Cmd+Click to add second
    await ws.selectItem("Task One");
    await ws.cmdClickItem("Task Two");
    await expect(ws.batchBar()).toBeVisible();

    // Clear selection
    await ws.batchClear().click();

    // Batch bar disappears
    await expect(ws.batchBar()).not.toBeVisible();

    // Items still in inbox
    await expect(page.getByText("Task One")).toBeVisible();
    await expect(page.getByText("Task Two")).toBeVisible();
  });
});
