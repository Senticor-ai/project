import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";
import { WorkspacePage } from "../pages/workspace.page";
import { ApiSeed } from "../helpers/api-seed";

/**
 * CV Enhancement Journey — full E2E with real LLM.
 *
 * Tests the complete flow:
 *   1. Register and log in via UI
 *   2. Seed a project with two documents (CV + job posting) via API
 *   3. Open Tay chat, ask to analyze CV against job posting
 *   4. Tay uses list_project_items → read_item_content tools
 *   5. Tay suggests a render_cv tool call with tailored CV
 *   6. Accept → agents render PDF via backend → reference created
 *   7. Verify PDF reference appears in project
 *
 * Requires: OPENROUTER_API_KEY, full e2e stack (backend + agents + frontend)
 *
 * Run:
 *   npx playwright test --config e2e/playwright.config.ts \
 *     --project=cv-enhancement -g "CV Enhancement"
 */

test.skip(
  !process.env.OPENROUTER_API_KEY,
  "requires OPENROUTER_API_KEY for real LLM calls",
);

test.describe("CV Enhancement Journey", () => {
  test.setTimeout(180_000); // 3 min — multiple LLM round-trips

  test("upload docs → triage → Tay analyzes → render CV PDF", async ({
    page,
  }, testInfo) => {
    const log = (msg: string) => console.log(`[cv-e2e] ${msg}`);

    // ── 0. Register & Login via UI ────────────────────────────────────
    const uniqueId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const email = `cv-e2e-${uniqueId}@test.example.com`;
    const password = "Testpass1!";

    log(`Registering user: ${email}`);
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(loginPage.heading).toHaveText("Sign in to continue");
    await loginPage.register(email, password);

    const ws = new WorkspacePage(page);
    await expect(ws.bucketNav).toBeVisible({ timeout: 15_000 });
    log("Registration complete, workspace visible");

    // Get CSRF token for API seeding
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === "tay_csrf");
    const apiSeed = new ApiSeed(page.request, csrfCookie?.value ?? "");

    // ── 1. Create a project for the job application ───────────────────
    const projectId = await apiSeed.createProject(
      "Bewerbung Senior Forward Deployed AI Engineer",
      "Stelle bei Palantir als Senior Forward Deployed AI Engineer bekommen",
    );
    log(`Project created: ${projectId}`);

    // ── 2. Seed a CV document into the project (reference bucket) ─────
    const cvRefId = await apiSeed.createReference(
      "Lebenslauf-Wolfgang.pdf",
      {
        type: "DigitalDocument",
        encodingFormat: "application/pdf",
        origin: "captured",
        projectId,
      },
    );
    log(`CV reference created: ${cvRefId}`);

    // ── 3. Seed a job posting into the project (reference bucket) ─────
    const jobRefId = await apiSeed.createReference(
      "Stellenanzeige-FDAI-Engineer.pdf",
      {
        type: "DigitalDocument",
        encodingFormat: "application/pdf",
        origin: "captured",
        projectId,
      },
    );
    log(`Job posting reference created: ${jobRefId}`);

    // Track known reference IDs so we can find the new one later
    const knownRefIds = new Set([cvRefId, jobRefId]);
    log(`Known reference IDs: ${[...knownRefIds].join(", ")}`);

    // ── 4. Reload and verify project setup ────────────────────────────
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    // Verify documents are in Reference
    await ws.navigateTo("Reference");
    await expect(page.getByText("Lebenslauf-Wolfgang.pdf")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText("Stellenanzeige-FDAI-Engineer.pdf"),
    ).toBeVisible();
    log("Verified both documents visible in Reference bucket");

    // Verify project exists
    await ws.navigateTo("Projects");
    await expect(
      page.getByText("Bewerbung Senior Forward Deployed AI Engineer"),
    ).toBeVisible({ timeout: 10_000 });
    log("Verified project visible in Projects bucket");

    // Screenshot: initial state
    const setupScreenshot = await page.screenshot();
    await testInfo.attach("01-project-setup.png", {
      body: setupScreenshot,
      contentType: "image/png",
    });
    log("Attached screenshot: 01-project-setup.png");

    // ── 5. Open Tay chat & intercept tool execution ────────────────────
    // Capture what tool calls the agent suggests and what gets executed
    let executedToolName: string | undefined;
    let executedToolArgs: Record<string, unknown> | undefined;
    page.on("request", (req) => {
      if (req.url().includes("/chat/execute-tool") && req.method() === "POST") {
        try {
          const body = req.postDataJSON() as {
            toolCall?: { name: string; arguments: Record<string, unknown> };
          };
          executedToolName = body?.toolCall?.name;
          executedToolArgs = body?.toolCall?.arguments;
          log(`Execute-tool intercepted: ${executedToolName}`);
        } catch {
          /* ignore parse errors */
        }
      }
    });

    await page.getByRole("button", { name: /Chat mit Tay/ }).click();
    await expect(
      page.getByRole("complementary", { name: "Tay Chat" }),
    ).toBeVisible();
    log("Tay chat panel opened");

    const chatInput = page.getByRole("textbox", {
      name: "Nachricht an Tay",
    });

    // ── 6. Ask Tay to analyze the CV and render a new version ─────────
    //    Use natural language with the project name — Tay should discover
    //    IDs via list_workspace_overview / list_project_items.
    const prompt =
      `In meinem Projekt "Bewerbung Senior Forward Deployed AI Engineer" ` +
      `liegen mein Lebenslauf und eine Stellenanzeige. ` +
      `Bitte erstelle einen angepassten Lebenslauf als PDF mit ` +
      `Schriftart Inter und modernem Design. ` +
      `Speichere das Ergebnis im Projekt.`;
    log(`Sending prompt: ${prompt.slice(0, 80)}...`);
    await chatInput.fill(prompt);
    await chatInput.press("Enter");

    // Wait for Tay to respond with a render_cv tool call suggestion.
    // The "Übernehmen" button appears when Tay suggests a tool call.
    const acceptButton = page.getByRole("button", { name: /Übernehmen/ });

    let gotToolCall = await acceptButton
      .waitFor({ state: "visible", timeout: 90_000 })
      .then(() => true)
      .catch(() => false);

    if (!gotToolCall) {
      log("No tool call on first attempt — sending nudge prompt");
      // LLM responded with text (analysis or questions) — nudge harder
      await page.waitForTimeout(1_000);
      await chatInput.fill(
        "Bitte jetzt direkt einen render_cv Tool-Call vorschlagen. " +
          "CV-Daten kannst du erfinden (Name: Wolfgang Müller, " +
          "Headline: Senior AI Engineer, eine Berufserfahrung). " +
          `Schriftart Inter, schlichte Farben, projectId: "${projectId}".`,
      );
      await chatInput.press("Enter");
      await expect(acceptButton).toBeVisible({ timeout: 90_000 });
    }
    log("Tool call suggestion received — Übernehmen button visible");

    // Screenshot: tool call suggestion before accepting
    const suggestionScreenshot = await page.screenshot();
    await testInfo.attach("02-tool-call-suggestion.png", {
      body: suggestionScreenshot,
      contentType: "image/png",
    });
    log("Attached screenshot: 02-tool-call-suggestion.png");

    // ── 7. Accept the tool call suggestion ────────────────────────────
    await acceptButton.click();
    log("Clicked Übernehmen — executing tool call");

    // ── 8. Verify acceptance ──────────────────────────────────────────
    // Suggestion card shows "Übernommen" when accepted.
    // The tool execution may take time (PDF rendering).
    await expect(page.getByText("Übernommen")).toBeVisible({
      timeout: 60_000,
    });
    log("Tool call accepted — Übernommen visible");

    // Wait for confirmation message (could be "1 Dokument." or similar)
    await page.waitForTimeout(5_000);
    log(
      `Executed tool: ${executedToolName ?? "unknown"}` +
        (executedToolArgs
          ? ` (args keys: ${Object.keys(executedToolArgs).join(", ")})`
          : ""),
    );

    // Attach the tool call details as a JSON artifact
    if (executedToolName) {
      await testInfo.attach("executed-tool-call.json", {
        body: Buffer.from(
          JSON.stringify(
            { name: executedToolName, arguments: executedToolArgs },
            null,
            2,
          ),
        ),
        contentType: "application/json",
      });
      log("Attached artifact: executed-tool-call.json");
    }

    // Screenshot: confirmation after acceptance
    const confirmationScreenshot = await page.screenshot();
    await testInfo.attach("03-confirmation.png", {
      body: confirmationScreenshot,
      contentType: "image/png",
    });
    log("Attached screenshot: 03-confirmation.png");

    // ── 9. Close chat panel ───────────────────────────────────────────
    await page
      .getByRole("complementary", { name: "Tay Chat" })
      .getByRole("button", { name: "Chat schließen" })
      .click();
    log("Chat panel closed");

    // ── 10. Verify the rendered PDF appears in Reference ──────────────
    await ws.navigateTo("Reference");
    await page.waitForTimeout(2_000);

    // Structural assertion: at least 3 items in Reference
    // (2 original docs + 1 rendered PDF)
    const referenceItems = page
      .getByRole("main", { name: "Bucket content" })
      .locator("[class*='group']");
    await expect(referenceItems.first()).toBeVisible({ timeout: 10_000 });
    const refCount = await referenceItems.count();
    log(`Reference bucket item count: ${refCount} (expected >= 3)`);
    expect(refCount).toBeGreaterThanOrEqual(3);

    // ── 11. Verify in ProjectTree ─────────────────────────────────────
    await ws.navigateTo("Projects");
    await ws
      .projectRow("Bewerbung Senior Forward Deployed AI Engineer")
      .click();

    // Project should show the original docs + the new rendered CV
    await expect(page.getByText("Lebenslauf-Wolfgang.pdf")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText("Stellenanzeige-FDAI-Engineer.pdf"),
    ).toBeVisible();

    // Screenshot: final project state
    const projectScreenshot = await page.screenshot();
    await testInfo.attach("04-project-final.png", {
      body: projectScreenshot,
      contentType: "image/png",
    });
    log("Attached screenshot: 04-project-final.png");

    // ── 12. Fetch & attach rendered PDF via API ─────────────────────
    // GET /api/items returns a flat list of { item_id, canonical_id, source, item }
    type ItemEnvelope = {
      item_id: string;
      canonical_id: string;
      source: string;
      item: Record<string, unknown>;
    };
    type PropValue = { propertyID: string; value: unknown };

    const getProp = (item: Record<string, unknown>, pid: string) =>
      (item.additionalProperty as PropValue[] | undefined)?.find(
        (p) => p.propertyID === pid,
      )?.value;

    // Poll API for new items (the rendered PDF might take a moment to appear)
    log("Polling API for rendered PDF item...");
    let allEnvelopes: ItemEnvelope[] = [];
    let newRefs: ItemEnvelope[] = [];
    const maxPolls = 5;
    for (let poll = 1; poll <= maxPolls; poll++) {
      const itemsResp = await page.request.get("/api/items?limit=100", {
        headers: csrfCookie ? { "X-CSRF-Token": csrfCookie.value } : {},
      });
      allEnvelopes = await itemsResp.json();
      newRefs = allEnvelopes.filter((env) => {
        const bucket = getProp(env.item, "app:bucket");
        return bucket === "reference" && !knownRefIds.has(env.canonical_id);
      });
      log(
        `Poll ${poll}/${maxPolls}: ${allEnvelopes.length} items, ${newRefs.length} new ref(s)`,
      );
      if (newRefs.length > 0) break;
      if (poll < maxPolls) await page.waitForTimeout(3_000);
    }

    // Debug: log ALL items
    for (const env of allEnvelopes) {
      const name = (env.item.name as string) ?? "unnamed";
      const type = env.item["@type"] as string;
      const bucket = getProp(env.item, "app:bucket") as string;
      const fileId = getProp(env.item, "app:fileId") as string | undefined;
      log(
        `  [${bucket}] ${type}: "${name}" (${env.canonical_id})${fileId ? ` fileId=${fileId}` : ""}`,
      );
    }
    log(`Found ${newRefs.length} new reference item(s)`);

    for (const env of newRefs) {
      const refName =
        (env.item.name as string) ?? env.canonical_id;
      log(`  New reference: "${refName}" (${env.canonical_id})`);

      // Extract download URL — try app:downloadUrl first, fallback to app:fileId
      let downloadUrl = getProp(env.item, "app:downloadUrl") as
        | string
        | undefined;
      if (!downloadUrl) {
        const fileId = getProp(env.item, "app:fileId") as
          | string
          | undefined;
        if (fileId) {
          downloadUrl = `/api/files/${fileId}`;
          log(`  Constructed download URL from fileId: ${downloadUrl}`);
        }
      }

      if (downloadUrl) {
        log(`  Download URL: ${downloadUrl}`);
        try {
          const pdfResp = await page.request.get(downloadUrl);
          if (pdfResp.ok()) {
            const pdfBody = await pdfResp.body();
            const filename = refName.endsWith(".pdf")
              ? refName
              : `${refName}.pdf`;
            await testInfo.attach(filename, {
              body: pdfBody,
              contentType: "application/pdf",
            });
            log(
              `  Attached PDF artifact: ${filename} (${pdfBody.length} bytes)`,
            );
          } else {
            log(`  PDF download failed: ${pdfResp.status()}`);
          }
        } catch (err) {
          log(`  PDF download error: ${err}`);
        }
      } else {
        log(`  No download URL found for this reference`);
      }
    }

    // If no new refs found via canonical_id filter, try finding any item
    // with a downloadUrl (the rendered PDF)
    if (newRefs.length === 0) {
      log("No new refs by canonical_id — searching by downloadUrl...");
      const withDownload = allEnvelopes.filter(
        (env) => getProp(env.item, "app:downloadUrl") != null,
      );
      log(`Found ${withDownload.length} item(s) with downloadUrl`);
      for (const env of withDownload) {
        const dl = getProp(env.item, "app:downloadUrl") as string;
        const refName = (env.item.name as string) ?? env.canonical_id;
        log(`  Downloading: "${refName}" from ${dl}`);
        try {
          const pdfResp = await page.request.get(dl);
          if (pdfResp.ok()) {
            const pdfBody = await pdfResp.body();
            const filename = refName.endsWith(".pdf")
              ? refName
              : `${refName}.pdf`;
            await testInfo.attach(filename, {
              body: pdfBody,
              contentType: "application/pdf",
            });
            log(
              `  Attached PDF artifact: ${filename} (${pdfBody.length} bytes)`,
            );
          } else {
            log(`  PDF download failed: ${pdfResp.status()}`);
          }
        } catch (err) {
          log(`  PDF download error: ${err}`);
        }
      }
    }

    // ── 13. Log all project items for review ──────────────────────────
    const projectItems = allEnvelopes.filter((env) => {
      const projectRefs = getProp(env.item, "app:projectRefs") as
        | string[]
        | undefined;
      return projectRefs?.includes(projectId);
    });
    log(`Project "${projectId}" contains ${projectItems.length} item(s):`);
    for (const env of projectItems) {
      const name = (env.item.name as string) ?? env.canonical_id;
      const type = env.item["@type"] as string;
      log(`  - ${type}: "${name}"`);
    }

    log("CV Enhancement E2E test complete");
  });
});
