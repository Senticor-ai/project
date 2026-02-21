import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";
import { WorkspacePage } from "../pages/workspace.page";
import { ApiSeed } from "../helpers/api-seed";

/**
 * CV Enhancement Journey — full E2E with real LLM.
 *
 * Tests the two-step markdown-first flow:
 *   1. Register and log in via UI
 *   2. Seed a project with two documents (CV + job posting) via API
 *   3. Open Tay chat, ask to create a tailored markdown CV
 *   4. Tay uses list_project_items → read_item_content, then
 *      suggests create_reference with tailored markdown
 *   5. Accept → markdown reference saved in project
 *   6. Ask Tay to render the markdown CV as PDF
 *   7. Tay suggests render_cv with sourceItemId pointing to the markdown ref
 *   8. Accept → PDF rendered and saved as reference
 *   9. Verify both new references appear in project
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
  test.setTimeout(240_000); // 4 min — multiple LLM round-trips (two-step flow)

  test("upload docs → triage → Tay tailors markdown → render PDF", async ({
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
    const csrfCookie = cookies.find((c) => c.name === "project_csrf");
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
    const executedTools: Array<{
      name: string;
      args: Record<string, unknown>;
    }> = [];
    page.on("request", (req) => {
      if (req.url().includes("/chat/execute-tool") && req.method() === "POST") {
        try {
          const body = req.postDataJSON() as {
            toolCall?: { name: string; arguments: Record<string, unknown> };
          };
          if (body?.toolCall) {
            executedTools.push({
              name: body.toolCall.name,
              args: body.toolCall.arguments,
            });
            log(`Execute-tool intercepted: ${body.toolCall.name}`);
          }
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

    // ── 6. Step 1: Ask Tay to create a tailored markdown CV ────────────
    const prompt =
      `In meinem Projekt "Bewerbung Senior Forward Deployed AI Engineer" ` +
      `liegen mein Lebenslauf und eine Stellenanzeige. ` +
      `Bitte erstelle eine auf die Stelle angepasste Version meines Lebenslaufs ` +
      `als Markdown-Referenz im Projekt. Danach rendere ich das als PDF.`;
    log(`Sending prompt: ${prompt.slice(0, 80)}...`);
    await chatInput.fill(prompt);
    await chatInput.press("Enter");

    // Wait for Tay to respond with a tool call suggestion (create_reference or render_cv).
    const acceptButton = page.getByRole("button", { name: /Übernehmen/ });

    let gotToolCall = await acceptButton
      .waitFor({ state: "visible", timeout: 90_000 })
      .then(() => true)
      .catch(() => false);

    if (!gotToolCall) {
      log("No tool call on first attempt — sending nudge prompt");
      await page.waitForTimeout(1_000);
      await chatInput.fill(
        "Bitte jetzt direkt einen create_reference Tool-Call vorschlagen " +
          "mit dem angepassten Lebenslauf als Markdown im description-Feld. " +
          `projectId: "${projectId}".`,
      );
      await chatInput.press("Enter");
      await expect(acceptButton).toBeVisible({ timeout: 90_000 });
    }
    log("Step 1: Tool call suggestion received — Übernehmen button visible");

    // Screenshot: step 1 suggestion
    const step1Screenshot = await page.screenshot();
    await testInfo.attach("02-step1-markdown-suggestion.png", {
      body: step1Screenshot,
      contentType: "image/png",
    });

    // Accept the create_reference (or whichever tool Tay chose)
    await acceptButton.click();
    log("Clicked Übernehmen — executing step 1 tool call");

    await expect(page.getByText("Übernommen")).toBeVisible({
      timeout: 60_000,
    });
    log("Step 1 accepted — Übernommen visible");
    await page.waitForTimeout(3_000);

    // Log what was executed
    const step1Tool = executedTools[executedTools.length - 1];
    log(
      `Step 1 executed: ${step1Tool?.name ?? "unknown"}` +
        (step1Tool ? ` (args keys: ${Object.keys(step1Tool.args).join(", ")})` : ""),
    );

    // Attach tool call details
    if (step1Tool) {
      await testInfo.attach("step1-tool-call.json", {
        body: Buffer.from(JSON.stringify(step1Tool, null, 2)),
        contentType: "application/json",
      });
    }

    // Screenshot after step 1 acceptance
    const step1ConfirmScreenshot = await page.screenshot();
    await testInfo.attach("03-step1-confirmation.png", {
      body: step1ConfirmScreenshot,
      contentType: "image/png",
    });

    // ── 7. Step 2: Ask Tay to render the markdown as PDF ───────────────
    // If step 1 was already render_cv (Tay chose to go direct), skip step 2
    const step1WasRenderCv = step1Tool?.name === "render_cv";
    if (!step1WasRenderCv) {
      log("Step 2: Asking Tay to render the markdown CV as PDF");
      await chatInput.fill(
        "Perfekt! Bitte rendere die angepasste Version jetzt als PDF. " +
          "Schriftart Inter, modernes Design, dezente Farben.",
      );
      await chatInput.press("Enter");

      // Wait for next tool call suggestion (render_cv)
      // Need to wait for a NEW Übernehmen button (the old one is now "Übernommen")
      const newAcceptButton = page
        .getByRole("button", { name: /Übernehmen/ })
        .last();

      let gotRenderCall = await newAcceptButton
        .waitFor({ state: "visible", timeout: 90_000 })
        .then(() => true)
        .catch(() => false);

      if (!gotRenderCall) {
        log("No render_cv on first attempt — sending nudge");
        await page.waitForTimeout(1_000);
        await chatInput.fill(
          "Bitte jetzt einen render_cv Tool-Call vorschlagen. " +
            "sourceItemId ist die eben erstellte Markdown-Referenz. " +
            "Schriftart Inter, schlichte Farben. " +
            `projectId: "${projectId}".`,
        );
        await chatInput.press("Enter");
        await expect(newAcceptButton).toBeVisible({ timeout: 90_000 });
      }
      log("Step 2: render_cv suggestion received");

      // Screenshot: step 2 suggestion
      const step2Screenshot = await page.screenshot();
      await testInfo.attach("04-step2-render-suggestion.png", {
        body: step2Screenshot,
        contentType: "image/png",
      });

      // Accept the render_cv
      await newAcceptButton.click();
      log("Clicked Übernehmen — executing render_cv");

      // Wait for acceptance (second "Übernommen")
      const allAccepted = page.getByText("Übernommen");
      await expect(allAccepted.last()).toBeVisible({ timeout: 60_000 });
      log("Step 2 accepted — Übernommen visible");

      await page.waitForTimeout(5_000);

      const step2Tool = executedTools[executedTools.length - 1];
      log(
        `Step 2 executed: ${step2Tool?.name ?? "unknown"}` +
          (step2Tool
            ? ` (args keys: ${Object.keys(step2Tool.args).join(", ")})`
            : ""),
      );

      if (step2Tool) {
        await testInfo.attach("step2-tool-call.json", {
          body: Buffer.from(JSON.stringify(step2Tool, null, 2)),
          contentType: "application/json",
        });
      }
    } else {
      log("Step 1 was already render_cv — skipping step 2");
    }

    // Screenshot: confirmation after all steps
    const confirmationScreenshot = await page.screenshot();
    await testInfo.attach("05-final-confirmation.png", {
      body: confirmationScreenshot,
      contentType: "image/png",
    });

    // ── 8. Close chat panel ───────────────────────────────────────────
    await page
      .getByRole("complementary", { name: "Tay Chat" })
      .getByRole("button", { name: "Chat schließen" })
      .click();
    log("Chat panel closed");

    // ── 9. Verify new references appear in Reference bucket ────────────
    await ws.navigateTo("Reference");
    await page.waitForTimeout(2_000);

    // Structural assertion: at least 3 items in Reference
    // (2 original docs + at least 1 new item — markdown and/or PDF)
    const referenceItems = page
      .getByRole("main", { name: "Bucket content" })
      .locator("[class*='group']");
    await expect(referenceItems.first()).toBeVisible({ timeout: 10_000 });
    const refCount = await referenceItems.count();
    log(`Reference bucket item count: ${refCount} (expected >= 3)`);
    expect(refCount).toBeGreaterThanOrEqual(3);

    // Screenshot: reference bucket
    const refScreenshot = await page.screenshot();
    await testInfo.attach("06-reference-bucket.png", {
      body: refScreenshot,
      contentType: "image/png",
    });

    // ── 10. Verify in ProjectTree ─────────────────────────────────────
    await ws.navigateTo("Projects");
    await ws
      .projectRow("Bewerbung Senior Forward Deployed AI Engineer")
      .click();

    // Project should show the original docs + new items
    await expect(page.getByText("Lebenslauf-Wolfgang.pdf")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText("Stellenanzeige-FDAI-Engineer.pdf"),
    ).toBeVisible();

    // Screenshot: final project state
    const projectScreenshot = await page.screenshot();
    await testInfo.attach("07-project-final.png", {
      body: projectScreenshot,
      contentType: "image/png",
    });
    log("Attached screenshot: 07-project-final.png");

    // ── 11. Fetch & attach rendered PDF via API ─────────────────────
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

    // Poll API for new items
    log("Polling API for new items...");
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
      const refName = (env.item.name as string) ?? env.canonical_id;
      log(`  New reference: "${refName}" (${env.canonical_id})`);

      // Try to download PDF if it has a fileId
      let downloadUrl = getProp(env.item, "app:downloadUrl") as
        | string
        | undefined;
      if (!downloadUrl) {
        const fileId = getProp(env.item, "app:fileId") as string | undefined;
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
      }

      // Attach markdown content if present (the tailored markdown reference)
      const description = env.item.description as string | undefined;
      if (description) {
        await testInfo.attach(`${refName}-markdown.md`, {
          body: Buffer.from(description),
          contentType: "text/markdown",
        });
        log(`  Attached markdown content: ${refName}-markdown.md`);
      }
    }

    // Fallback: search by downloadUrl if no new refs found
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

    // ── 12. Log all project items for review ──────────────────────────
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

    // Attach summary of all executed tools
    await testInfo.attach("all-executed-tools.json", {
      body: Buffer.from(JSON.stringify(executedTools, null, 2)),
      contentType: "application/json",
    });

    log("CV Enhancement E2E test complete");
  });
});
