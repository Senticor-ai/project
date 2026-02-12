import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

// =============================================================================
// Tax Prep Journey — Steuererklärung 2025 CPA Handoff
//
// Living E2E scoreboard for the full 7-phase journey documented in:
//   Storybook → Flows → Tax Prep Overview
//   (frontend/src/docs/flows/TaxPrepJourney.mdx)
//
// Run:  npm run test:e2e:journey
//
// Tests marked test.fixme() need features that haven't been built yet.
// They show as "skipped" in CI and turn green as epics ship.
// =============================================================================

// ---------------------------------------------------------------------------
// Phase 1: Import What You Have (Epic: Import)
// ---------------------------------------------------------------------------

test.describe("Phase 1: Import What You Have", () => {
  test("PDF inbox item shows DigitalDocument type and PDF chip", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createDigitalDocumentInboxItem("W-2 Arbeitgeber.pdf", {
      encodingFormat: "application/pdf",
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    await expect(page.getByText("W-2 Arbeitgeber.pdf")).toBeVisible();
    await expect(page.getByText("PDF")).toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("1");
  });

  test("multiple PDFs appear in inbox with correct count", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createDigitalDocumentInboxItem("W-2 Arbeitgeber.pdf", {
      encodingFormat: "application/pdf",
    });
    await apiSeed.createDigitalDocumentInboxItem("1099-INT Schwab.pdf", {
      encodingFormat: "application/pdf",
    });
    await apiSeed.createDigitalDocumentInboxItem("1098 Hypothek.pdf", {
      encodingFormat: "application/pdf",
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    await expect(page.getByText("W-2 Arbeitgeber.pdf")).toBeVisible();
    await expect(page.getByText("1099-INT Schwab.pdf")).toBeVisible();
    await expect(page.getByText("1098 Hypothek.pdf")).toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("3");
  });

  test("drag-drop a real PDF file into inbox triggers upload", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);

    // Prepare response waiters before triggering the drop
    const itemCreated = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/items") &&
        resp.request().method() === "POST" &&
        resp.status() === 201,
    );
    const uploadInitiated = page.waitForResponse(
      (resp) =>
        resp.url().includes("/files/initiate") &&
        resp.request().method() === "POST",
    );

    // 1. Dispatch dragenter on document to activate FileDropZone overlay
    await page.evaluate(() => {
      const pdfBytes = new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
      ]);
      const file = new File([pdfBytes], "Steuerbeleg-2025.pdf", {
        type: "application/pdf",
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      document.dispatchEvent(
        new DragEvent("dragenter", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
    });

    // 2. Wait for FileDropZone to render
    const dropZone = page.locator('[data-testid="file-drop-zone"]');
    await dropZone.waitFor({ timeout: 5_000 });

    // 3. Dispatch drop on the FileDropZone element
    await page.evaluate(() => {
      const pdfBytes = new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
      ]);
      const file = new File([pdfBytes], "Steuerbeleg-2025.pdf", {
        type: "application/pdf",
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      const zone = document.querySelector('[data-testid="file-drop-zone"]');
      if (!zone) throw new Error("FileDropZone not found");
      zone.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
      zone.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
    });

    // 4. Wait for item creation and upload initiation
    await itemCreated;
    await uploadInitiated;

    // 5. Assert the file appears in inbox
    await expect(page.getByText("Steuerbeleg-2025.pdf")).toBeVisible();
    await expect(page.getByText("PDF")).toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("1");
  });
});

// ---------------------------------------------------------------------------
// Phase 2: Triage & Label (Epic: Triage)
// ---------------------------------------------------------------------------

test.describe("Phase 2: Triage & Label", () => {
  test("triage DigitalDocument directly to Reference", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createDigitalDocumentInboxItem("1099-INT Schwab.pdf", {
      encodingFormat: "application/pdf",
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    await expect(page.getByText("1099-INT Schwab.pdf")).toBeVisible();

    await ws.triageButton("Reference").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    await ws.navigateTo("Reference");
    await expect(page.getByText("1099-INT Schwab.pdf")).toBeVisible();
  });

  test("triage DigitalDocument to Next triggers split (ReadAction + reference)", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createDigitalDocumentInboxItem("W-2 Form.pdf", {
      encodingFormat: "application/pdf",
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();

    // Wait for split PATCH to settle
    const splitDone = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/items/") &&
        resp.request().method() === "PATCH",
    );
    await ws.triageButton("Next").click();
    await splitDone;
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // ReadAction in Next
    await ws.navigateTo("Next");
    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();

    // Reference copy in Reference bucket
    await ws.navigateTo("Reference");
    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();
  });

  test("tag document with IRS schedule during triage", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createDigitalDocumentInboxItem("1099-INT Schwab.pdf", {
      encodingFormat: "application/pdf",
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    await expect(page.getByText("1099-INT Schwab.pdf")).toBeVisible();

    // Expand More options to reveal the ItemEditor
    await ws.moreOptionsToggle().click();

    // Add first tag
    const tagInput = page.getByRole("textbox", { name: "Add tag" });
    const tagPatch1 = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/items/") &&
        resp.request().method() === "PATCH",
    );
    await tagInput.fill("1099-int");
    await tagInput.press("Enter");
    await tagPatch1;

    // Add second tag
    const tagPatch2 = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/items/") &&
        resp.request().method() === "PATCH",
    );
    await tagInput.fill("schedule-b");
    await tagInput.press("Enter");
    await tagPatch2;

    // Triage to Reference
    await ws.triageButton("Reference").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // Navigate to Reference and verify tags persisted
    await ws.navigateTo("Reference");
    await expect(page.getByText("1099-INT Schwab.pdf")).toBeVisible();
    await expect(page.getByText("1099-int")).toBeVisible();
    await expect(page.getByText("schedule-b")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Phase 2b: Project-Reference Linking (Epic: ProjectRefs)
// ---------------------------------------------------------------------------

test.describe("Phase 2b: Project-Reference Linking", () => {
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

    await expect(page.getByText("Steuererklärung 2025")).toBeVisible();

    await ws.projectRow("Steuererklärung 2025").click();
    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();
    await expect(page.getByText("1099-INT Schwab.pdf")).toBeVisible();
    await expect(page.getByText("Belege sortieren")).toBeVisible();
  });

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

    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();
    await expect(page.getByText("General notes")).toBeVisible();

    // Project badge appears on linked reference
    await expect(page.getByText("Steuererklärung 2025")).toBeVisible();
  });

  test("split-on-triage: reference copy inherits project from DigitalDocument", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Steuererklärung 2025",
      "CPA Übergabe komplett",
    );
    await apiSeed.createDigitalDocumentInboxItem("W-2 Form.pdf", {
      encodingFormat: "application/pdf",
      projectId,
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();

    // Wait for the split's PATCH to settle
    const splitDone = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/items/") &&
        resp.request().method() === "PATCH",
    );
    await ws.triageButton("Next").click();
    await splitDone;
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    await ws.navigateTo("Reference");
    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();

    // KEY: reference should show project badge (inherited from source item)
    await expect(page.getByText("Steuererklärung 2025")).toBeVisible();

    // Verify file chip appears in ProjectTree
    await ws.navigateTo("Projects");
    await ws.projectRow("Steuererklärung 2025").click();
    await expect(page.getByText("W-2 Form.pdf")).toBeVisible();
  });

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

    await ws.triageButton("Reference").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    await ws.navigateTo("Reference");
    await expect(page.getByText("1099-INT.pdf")).toBeVisible();
    await expect(page.getByText("Steuererklärung 2025")).toBeVisible();

    await ws.navigateTo("Projects");
    await ws.projectRow("Steuererklärung 2025").click();
    await expect(page.getByText("1099-INT.pdf")).toBeVisible();
  });

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

    await ws.moreOptionsToggle().click();

    await page.getByLabel("Assign to project").selectOption(projectId);

    // Wait briefly for the PATCH to persist
    await page.waitForTimeout(500);

    await ws.triageButton("Reference").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    await ws.navigateTo("Reference");
    await expect(page.getByText("Kontoauszug.pdf")).toBeVisible();
    await expect(page.getByText("Steuererklärung 2025")).toBeVisible();
  });

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

    await expect(page.getByText("Random notes")).toBeVisible();

    const badges = page.locator("text=Steuererklärung 2025");
    await expect(badges).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Identify Missing Documents (Epic: MissingDocs)
// ---------------------------------------------------------------------------

test.describe("Phase 3: Identify Missing Documents", () => {
  test("capture missing doc action and triage to Next", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);

    // Wait for the capture POST to settle before triaging
    const captured = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/items") &&
        resp.request().method() === "POST" &&
        resp.status() === 201,
    );
    await ws.captureInboxItem("1099-INT von Ally Bank herunterladen");
    await captured;
    await expect(
      page.getByText("1099-INT von Ally Bank herunterladen"),
    ).toBeVisible();

    await ws.triageButton("Next").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    await ws.navigateTo("Next");
    await expect(
      page.getByText("1099-INT von Ally Bank herunterladen"),
    ).toBeVisible();
  });

  test("capture delegated doc request and triage to Waiting", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);

    const captured = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/items") &&
        resp.request().method() === "POST" &&
        resp.status() === 201,
    );
    await ws.captureInboxItem("K-1 von XYZ Partners anfordern");
    await captured;
    await expect(
      page.getByText("K-1 von XYZ Partners anfordern"),
    ).toBeVisible();

    await ws.triageButton("Waiting").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    await ws.navigateTo("Waiting");
    await expect(
      page.getByText("K-1 von XYZ Partners anfordern"),
    ).toBeVisible();
  });

  test("capture missing doc, assign to tax project, triage to Next", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const projectId = await apiSeed.createProject(
      "Steuererklärung 2025",
      "CPA Übergabe komplett",
    );
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);

    const captured = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/items") &&
        resp.request().method() === "POST" &&
        resp.status() === 201,
    );
    await ws.captureInboxItem("1099-DIV von Vanguard herunterladen");
    await captured;
    await expect(
      page.getByText("1099-DIV von Vanguard herunterladen"),
    ).toBeVisible();

    // Assign project via More options
    await ws.moreOptionsToggle().click();
    await page.getByLabel("Assign to project").selectOption(projectId);
    await page.waitForTimeout(500);

    await ws.triageButton("Next").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // Verify in Next
    await ws.navigateTo("Next");
    await expect(
      page.getByText("1099-DIV von Vanguard herunterladen"),
    ).toBeVisible();

    // Verify in ProjectTree
    await ws.navigateTo("Projects");
    await ws.projectRow("Steuererklärung 2025").click();
    await expect(
      page.getByText("1099-DIV von Vanguard herunterladen"),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Phase 4: Download & Attach Missing Docs (Epic: Attach)
// ---------------------------------------------------------------------------

test.describe("Phase 4: Download & Attach Missing Docs", () => {
  test("complete a download action in Next", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createAction("1099-INT von Ally Bank herunterladen", "next");
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next");

    await expect(
      page.getByText("1099-INT von Ally Bank herunterladen"),
    ).toBeVisible();

    await ws.completeCheckbox("1099-INT von Ally Bank herunterladen").click();

    // Action should disappear from Next (moved to completed)
    await expect(
      page.getByText("1099-INT von Ally Bank herunterladen"),
    ).not.toBeVisible();
  });

  // Epic: Attach — needs Action.result linking UI
  test.fixme("complete action and link result to new reference", async ({
    authenticatedPage: _page,
  }) => {
    // After completing "Download 1099-INT", a dialog would offer to create
    // a reference from the result. The new reference would be linked via
    // schema.org Action.result to the completed action.
  });

  // Epic: Attach — needs file-attach button on ReferenceRow
  test.fixme("attach file to existing reference item", async ({
    authenticatedPage: _page,
  }) => {
    // Navigate to Reference, expand a reference, click "Attach file",
    // select a PDF. The file uploads via chunked API and links to the
    // reference via app:fileId + app:downloadUrl.
  });
});

// ---------------------------------------------------------------------------
// Phase 5: Extract Key Details (Epic: Extract)
// ---------------------------------------------------------------------------

test.describe("Phase 5: Extract Key Details", () => {
  // Epic: Extract — needs PropertyValue editor UI
  test.fixme("add structured PropertyValue to reference (e.g. tax:w2:box1 = $85,000)", async ({
    authenticatedPage: _page,
  }) => {
    // Expand a reference, open the PropertyValue editor, add a new entry:
    //   propertyID: "tax:w2:box1", name: "Gross wages", value: 85000
    // Verify it persists after page reload.
  });

  // Epic: Extract — needs structured field display
  test.fixme("view extracted amounts on reference detail", async ({
    authenticatedPage: _page,
  }) => {
    // API-seed a reference with PropertyValues (tax:w2:box1, tax:w2:box2).
    // Navigate to Reference, expand the item, verify amounts display in
    // a structured format (not just description text).
  });
});

// ---------------------------------------------------------------------------
// Phase 6: Tax Organizer — Project View (Epic: Organizer)
// ---------------------------------------------------------------------------

test.describe("Phase 6: Tax Organizer (Project View)", () => {
  // Epic: Organizer — needs project-scoped filtering + table view
  test.fixme("view project-scoped reference table", async ({
    authenticatedPage: _page,
  }) => {
    // Navigate to Projects, expand "Steuererklärung 2025". Below the
    // action list, a table shows all linked references with columns:
    //   Document | Issuer | Schedule | Key Amount | Status | File
    // Verify W-2, 1099-INT, 1098 rows appear with correct data.
  });

  // Epic: Organizer — needs aggregation/sum logic
  test.fixme("see aggregated totals in tax organizer", async ({
    authenticatedPage: _page,
  }) => {
    // Same project view as above. A footer row shows:
    //   Total Wages: $85,000 | Total Interest: $2,139 | Total Deductions: $17,050
    // Requires MonetaryAmount support + sum aggregation.
  });
});

// ---------------------------------------------------------------------------
// Phase 7: Export & Handoff to CPA (Epic: Export)
// ---------------------------------------------------------------------------

test.describe("Phase 7: Export & Handoff to CPA", () => {
  // Epic: Export — needs CSV export wired to project UI
  test.fixme("export tax organizer as CSV", async ({
    authenticatedPage: _page,
  }) => {
    // Navigate to Projects, expand "Steuererklärung 2025", click
    // "Export CSV". Verify a download starts with the correct filename
    // and contains rows for each reference with PropertyValue columns.
  });

  // Epic: Export — needs file bundling endpoint
  test.fixme("download ZIP with organized PDFs", async ({
    authenticatedPage: _page,
  }) => {
    // Click "Export package" in project view. Backend assembles a ZIP:
    //   tax-prep-2025/
    //     tax-organizer-2025.csv
    //     schedule-b/1099-int-schwab.pdf
    //     income/w2-acme.pdf
    // Verify the ZIP download starts.
  });
});
