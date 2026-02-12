import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Tax Prep Journey — project-reference linking", () => {
  // -------------------------------------------------------------------------
  // Scenario 1: Pre-seeded references appear as file chips in ProjectTree
  // -------------------------------------------------------------------------

  test("ProjectTree shows file chips for project-linked references", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Steuererklärung 2025",
      "CPA Übergabe komplett",
    );
    await apiSeed.createAction("Belege sortieren", "next", {
      projectId,
      sequenceOrder: 1,
    });
    await apiSeed.createReference("W-2 Form.pdf", {
      type: "DigitalDocument",
      encodingFormat: "application/pdf",
      origin: "triaged",
      projectId,
    });
    await apiSeed.createReference("1099-INT Schwab.pdf", {
      origin: "captured",
      projectId,
    });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Projects");

    // Project visible with count badge (1 action + 2 references = 3)
    await expect(page.getByText("Steuererklärung 2025")).toBeVisible();

    // Expand to reveal file chips
    await ws.projectRow("Steuererklärung 2025").click();
    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();
    await expect(page.getByText("1099-INT Schwab.pdf")).toBeVisible();
    await expect(page.getByText("Belege sortieren")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Reference list shows project badge on linked references
  // -------------------------------------------------------------------------

  test("Reference list shows project badge for linked references", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Steuererklärung 2025",
      "CPA Übergabe komplett",
    );
    await apiSeed.createReference("W-2 Form.pdf", {
      type: "DigitalDocument",
      encodingFormat: "application/pdf",
      origin: "triaged",
      projectId,
    });
    await apiSeed.createReference("General notes", { origin: "captured" });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Reference");

    // Both references visible
    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();
    await expect(page.getByText("General notes")).toBeVisible();

    // Project badge appears on linked reference
    await expect(page.getByText("Steuererklärung 2025")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Split-on-triage — reference copy inherits project
  // -------------------------------------------------------------------------

  test("split-on-triage: reference copy inherits project from DigitalDocument", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Steuererklärung 2025",
      "CPA Übergabe komplett",
    );
    // DigitalDocument in inbox already has project assigned
    await apiSeed.createDigitalDocumentInboxItem("W-2 Form.pdf", {
      encodingFormat: "application/pdf",
      projectId,
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    // Verify item in inbox
    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();

    // Triage to Next — triggers split: ReadAction in Next + reference
    // Wait for the split's PATCH (fires after POST reference) to settle
    const splitDone = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/items/") &&
        resp.request().method() === "PATCH",
    );
    await ws.triageButton("Next").click();
    await splitDone;
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // Verify reference copy appears in Reference bucket
    await ws.navigateTo("Reference");
    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();

    // KEY: reference should show project badge (inherited from source item)
    await expect(page.getByText("Steuererklärung 2025")).toBeVisible();

    // Verify file chip appears in ProjectTree
    await ws.navigateTo("Projects");
    await ws.projectRow("Steuererklärung 2025").click();
    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Direct triage to Reference — project preserved
  // -------------------------------------------------------------------------

  test("direct triage to Reference preserves project", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Steuererklärung 2025",
      "CPA Übergabe komplett",
    );
    await apiSeed.createDigitalDocumentInboxItem("1099-INT.pdf", {
      encodingFormat: "application/pdf",
      projectId,
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    // Triage directly to Reference (no split)
    await ws.triageButton("Reference").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // Verify in Reference bucket with project badge
    await ws.navigateTo("Reference");
    await expect(page.getByText("1099-INT.pdf")).toBeVisible();
    await expect(page.getByText("Steuererklärung 2025")).toBeVisible();

    // Verify in ProjectTree
    await ws.navigateTo("Projects");
    await ws.projectRow("Steuererklärung 2025").click();
    await expect(page.getByText("1099-INT.pdf")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Interactive — assign project then triage to Reference
  // -------------------------------------------------------------------------

  test("assign project via More options, then triage to Reference", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Steuererklärung 2025",
      "CPA Übergabe komplett",
    );
    await apiSeed.createDigitalDocumentInboxItem("Kontoauszug.pdf", {
      encodingFormat: "application/pdf",
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    // Expand "More options" to reveal project picker
    await ws.moreOptionsToggle().click();

    // Select the project from the dropdown
    await page.getByLabel("Assign to project").selectOption(projectId);

    // Wait briefly for the PATCH to persist
    await page.waitForTimeout(500);

    // Triage to Reference
    await ws.triageButton("Reference").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // Verify project badge in Reference list
    await ws.navigateTo("Reference");
    await expect(page.getByText("Kontoauszug.pdf")).toBeVisible();
    await expect(page.getByText("Steuererklärung 2025")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Unlinked reference — no project badge
  // -------------------------------------------------------------------------

  test("reference without project shows no project badge", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createProject(
      "Steuererklärung 2025",
      "CPA Übergabe komplett",
    );
    await apiSeed.createReference("Random notes", { origin: "captured" });
    await page.reload();

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Reference");

    // Reference visible
    await expect(page.getByText("Random notes")).toBeVisible();

    // No project badge (project name should not appear next to this reference)
    // The project exists but this reference is not linked to it
    const badges = page.locator("text=Steuererklärung 2025");
    await expect(badges).toHaveCount(0);
  });
});
