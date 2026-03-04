import { test, expect, type Locator } from "@playwright/test";
import { LoginPage } from "../pages/login.page";
import { WorkspacePage } from "../pages/workspace.page";
import { DisclaimerPage } from "../pages/disclaimer.page";

/**
 * Real user journey — exercises the full app with no fixtures, no mocks,
 * no API seeding. Every interaction goes through the browser UI.
 *
 * Designed to run nightly against the deployed instance as a smoke test.
 * Each run creates a fresh user. LLM assertions are structural (count-based,
 * not content-specific) since LLM output is non-deterministic.
 *
 * Traces are always recorded (configured in the "smoke" playwright project)
 * so LLM request/response details are captured for debugging.
 *
 * @remarks Smoke users (`smoke-*@test.example.com`) accumulate in the DB.
 * The no-delete policy prevents removal; a scheduled job should archive
 * users matching this pattern older than N days.
 */

/** German UI strings used throughout the test — single place to update if i18n changes. */
const DE = {
  signIn: "Sign in to continue",
  chatButton: /Chat mit Copilot/,
  chatInput: "Nachricht an Copilot",
  chatPanel: "Copilot Chat",
  closeChat: "Chat schließen",
  accept: /Übernehmen/,
  accepted: "Übernommen",
  inboxEmpty: "Inbox is empty",
  expandProject: /^Expand /,
  completeAction: /^Complete /,
} as const;

test.describe("Real User Journey", () => {
  test.setTimeout(120_000);

  test("register → capture → triage → chat with Copilot → project", async ({
    page,
  }, testInfo) => {
    const log = (msg: string) => console.log(`[smoke] ${msg}`);
    const uniqueId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const email = `smoke-${uniqueId}@test.example.com`;
    const password = "Testpass1!";

    // Track executed tool calls for diagnostics
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

    // ── 1. Register via UI ──────────────────────────────────────────────
    await test.step("Register via UI", async () => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await expect(loginPage.heading).toHaveText(DE.signIn);
      await loginPage.register(email, password);
      log(`Registered user: ${email}`);

      // Dismiss first-login disclaimer modal (new users must acknowledge)
      const disclaimer = new DisclaimerPage(page);
      const hasDisclaimer = await disclaimer.acknowledgeButton
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (hasDisclaimer) {
        await disclaimer.acknowledge();
        await disclaimer.acknowledgeButton.waitFor({ state: "hidden" });
        log("Disclaimer acknowledged");
      }

      // Should land on workspace
      const ws = new WorkspacePage(page);
      await expect(
        ws.bucketNav,
        "Workspace bucket nav should be visible after registration",
      ).toBeVisible({ timeout: 15_000 });
      log("Workspace visible");
    });

    const ws = new WorkspacePage(page);

    // ── 2. Capture 3 inbox items ────────────────────────────────────────
    await test.step("Capture 3 inbox items", async () => {
      await ws.captureInboxItem("Einkaufsliste erstellen");
      await expect(page.getByText("Einkaufsliste erstellen")).toBeVisible();

      await ws.captureInboxItem("Zahnarzt anrufen");
      await expect(page.getByText("Zahnarzt anrufen")).toBeVisible();

      await ws.captureInboxItem("Artikel über Testing lesen");
      await expect(page.getByText("Artikel über Testing lesen")).toBeVisible();

      await expect(
        ws.bucketCount("Inbox"),
        "All 3 captured items should appear in inbox",
      ).toHaveText("3");
      log("Captured 3 inbox items");

      const screenshot = await page.screenshot();
      await testInfo.attach("01-inbox-captured.png", {
        body: screenshot,
        contentType: "image/png",
      });
    });

    // ── 3. Triage all three items ───────────────────────────────────────
    await test.step("Triage all items to buckets", async () => {
      // Explicitly select each item before triaging (deterministic, no auto-advance dependency)
      await page.getByText("Einkaufsliste erstellen").click();
      const triage1 = page.waitForResponse(
        (r) => r.url().includes("/items/") && r.request().method() === "PATCH",
      );
      await ws.triageButton("Next").click();
      await triage1;
      await expect(page.getByText("Einkaufsliste erstellen")).not.toBeVisible();
      await expect(
        ws.bucketCount("Inbox"),
        "After triaging Einkaufsliste to Next, inbox should show 2 remaining",
      ).toHaveText("2", { timeout: 10_000 });

      await page.getByText("Artikel über Testing lesen").click();
      const triage2 = page.waitForResponse(
        (r) => r.url().includes("/items/") && r.request().method() === "PATCH",
      );
      await ws.triageButton("Waiting").click();
      await triage2;
      await expect(
        page.getByText("Artikel über Testing lesen"),
      ).not.toBeVisible();
      await expect(
        ws.bucketCount("Inbox"),
        "After triaging Artikel to Waiting, inbox should show 1 remaining",
      ).toHaveText("1", { timeout: 10_000 });

      await page.getByText("Zahnarzt anrufen").click();
      const triage3 = page.waitForResponse(
        (r) => r.url().includes("/items/") && r.request().method() === "PATCH",
      );
      await ws.triageButton("Later").click();
      await triage3;
      await expect(
        page.getByText(DE.inboxEmpty),
        "After triaging all items, inbox should be empty",
      ).toBeVisible();
      log("All 3 items triaged");
    });

    // ── 4. Verify items landed in correct buckets ───────────────────────
    await test.step("Verify items in correct buckets", async () => {
      await ws.navigateTo("Next");
      await expect(
        page.getByText("Einkaufsliste erstellen"),
        "Einkaufsliste should appear in Next bucket",
      ).toBeVisible({ timeout: 10_000 });

      await ws.navigateTo("Waiting");
      await expect(
        page.getByText("Artikel über Testing lesen"),
        "Artikel should appear in Waiting bucket",
      ).toBeVisible({ timeout: 10_000 });

      await ws.navigateTo("Later");
      await expect(
        page.getByText("Zahnarzt anrufen"),
        "Zahnarzt should appear in Later bucket",
      ).toBeVisible({ timeout: 10_000 });
      log("All items verified in correct buckets");

      const screenshot = await page.screenshot();
      await testInfo.attach("02-triage-complete.png", {
        body: screenshot,
        contentType: "image/png",
      });
    });

    // ── 5. Chat with Copilot — ask to create a project ──────────────────
    await test.step("Chat with Copilot to create project", async () => {
      await page.getByRole("button", { name: DE.chatButton }).click();
      await expect(
        page.getByRole("complementary", { name: DE.chatPanel }),
      ).toBeVisible();

      const chatInput = page.getByRole("textbox", {
        name: DE.chatInput,
      });
      await chatInput.fill(
        "Erstelle mir bitte ein Projekt 'Steuererklärung 2025' " +
          "mit dem gewünschten Ergebnis 'Steuererklärung fristgerecht abgeben' " +
          "und 3 konkreten Aktionen für den Bucket 'next'.",
      );
      await chatInput.press("Enter");
      log("Sent project creation prompt to Copilot");

      // Wait for tool call suggestion with structured retry
      const acceptButton = page.getByRole("button", { name: DE.accept }).last();

      const waitForToolSuggestion = async (
        acceptLocator: Locator,
        retryPrompts: string[],
        stepLabel: string,
      ) => {
        for (let attempt = 0; attempt <= retryPrompts.length; attempt++) {
          const visible = await acceptLocator
            .waitFor({
              state: "visible",
              timeout: attempt === 0 ? 60_000 : 45_000,
            })
            .then(() => true)
            .catch(() => false);
          if (visible) return;
          if (attempt === retryPrompts.length) break;
          log(
            `${stepLabel}: no tool call yet, sending retry prompt ${attempt + 1}`,
          );
          await page.waitForTimeout(1_000);
          await chatInput.fill(retryPrompts[attempt]);
          await chatInput.press("Enter");
        }
        // Attach diagnostic screenshot before failing
        const failScreenshot = await page.screenshot();
        await testInfo.attach(`${stepLabel}-failed.png`, {
          body: failScreenshot,
          contentType: "image/png",
        });
        throw new Error(
          `${stepLabel}: no tool-call suggestion after ${retryPrompts.length + 1} attempts`,
        );
      };

      await waitForToolSuggestion(
        acceptButton,
        [
          "Bitte jetzt als create_project_with_actions Tool-Call vorschlagen.",
          "Bitte direkt einen create_project_with_actions Tool-Call. Kein weiterer Text.",
        ],
        "Create project",
      );

      // Accept the suggestion
      await acceptButton.click();
      log("Accepted tool call suggestion");

      // Verify confirmation (structural — proves execute-tool succeeded)
      await expect(
        page.getByText(DE.accepted),
        "Tool call acceptance confirmation should be visible",
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/erstellt/)).toBeVisible();
      log("Tool call confirmed");

      // Attach tool call details
      if (executedTools.length > 0) {
        await testInfo.attach("executed-tools.json", {
          body: Buffer.from(JSON.stringify(executedTools, null, 2)),
          contentType: "application/json",
        });
      }

      const screenshot = await page.screenshot();
      await testInfo.attach("03-chat-complete.png", {
        body: screenshot,
        contentType: "image/png",
      });

      // Close chat panel
      await page
        .getByRole("complementary", { name: DE.chatPanel })
        .getByRole("button", { name: DE.closeChat })
        .click();
      log("Chat panel closed");
    });

    // ── 6. Verify project was created (structural) ──────────────────────
    await test.step("Verify project created with actions", async () => {
      await ws.navigateTo("Projects");
      // At least one project should exist — look for an expandable project row
      const projectButton = page
        .getByRole("button", { name: DE.expandProject })
        .first();
      await expect(
        projectButton,
        "At least one expandable project should exist",
      ).toBeVisible({ timeout: 10_000 });

      // Expand the project
      await projectButton.click();

      // Structurally verify the LLM created actions inside the project:
      // each action has a "Complete <name>" checkbox. We asked for 3.
      const actionCheckboxes = page.getByLabel(DE.completeAction);
      await expect(
        actionCheckboxes.first(),
        "Project should contain at least one action with a checkbox",
      ).toBeVisible({ timeout: 10_000 });
      const actionCount = await actionCheckboxes.count();
      expect(actionCount).toBeGreaterThanOrEqual(3);
      log(`LLM created ${actionCount} actions (expected >= 3)`);

      const screenshot = await page.screenshot();
      await testInfo.attach("04-project-verified.png", {
        body: screenshot,
        contentType: "image/png",
      });
    });

    // ── 7. Add 2 more actions to the project via rapid entry ────────────
    await test.step("Add actions via rapid entry", async () => {
      await ws.projectActionInput().fill("Belege sortieren");
      await ws.projectActionInput().press("Enter");
      await expect(page.getByText("Belege sortieren")).toBeVisible();

      await ws.projectActionInput().fill("Formulare ausfüllen");
      await ws.projectActionInput().press("Enter");
      await expect(page.getByText("Formulare ausfüllen")).toBeVisible();

      // Verify total: LLM-created + 2 user-added
      const actionCheckboxes = page.getByLabel(DE.completeAction);
      const finalCount = await actionCheckboxes.count();
      expect(finalCount).toBeGreaterThanOrEqual(5);
      log(`Final action count: ${finalCount} (expected >= 5)`);

      const screenshot = await page.screenshot();
      await testInfo.attach("05-rapid-entry-complete.png", {
        body: screenshot,
        contentType: "image/png",
      });
    });
  });
});
