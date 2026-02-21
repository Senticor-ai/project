import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";
import { WorkspacePage } from "../pages/workspace.page";

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
 */
test.describe("Real User Journey", () => {
  test.setTimeout(120_000);

  test("register → capture → triage → chat with Tay → project", async ({
    page,
  }) => {
    const uniqueId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const email = `smoke-${uniqueId}@test.example.com`;
    const password = "Testpass1!";

    // ── 1. Register via UI ──────────────────────────────────────────────
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(loginPage.heading).toHaveText("Sign in to continue");
    await loginPage.register(email, password);

    // Should land on workspace
    const ws = new WorkspacePage(page);
    await expect(ws.bucketNav).toBeVisible({ timeout: 15_000 });

    // ── 2. Capture 3 inbox items ────────────────────────────────────────
    await ws.captureInboxItem("Einkaufsliste erstellen");
    await expect(page.getByText("Einkaufsliste erstellen")).toBeVisible();

    await ws.captureInboxItem("Zahnarzt anrufen");
    await expect(page.getByText("Zahnarzt anrufen")).toBeVisible();

    await ws.captureInboxItem("Artikel über Testing lesen");
    await expect(page.getByText("Artikel über Testing lesen")).toBeVisible();

    await expect(ws.bucketCount("Inbox")).toHaveText("3");

    // ── 3. Triage all three items ───────────────────────────────────────
    // First captured item ("Einkaufsliste") is auto-expanded.
    // After triaging, auto-advance picks newest remaining.
    // Triage order: Einkaufsliste → Artikel → Zahnarzt
    // Wait for each item to disappear before checking count (avoids flaky timing)
    await ws.triageButton("Next").click();
    await expect(page.getByText("Einkaufsliste erstellen")).not.toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("2");

    await ws.triageButton("Waiting").click();
    await expect(page.getByText("Artikel über Testing lesen")).not.toBeVisible();
    await expect(ws.bucketCount("Inbox")).toHaveText("1");

    await ws.triageButton("Later").click();
    await expect(page.getByText("Inbox is empty")).toBeVisible();

    // ── 4. Verify items landed in correct buckets ───────────────────────
    // Use longer timeout — data needs to propagate after triage mutations
    await ws.navigateTo("Next");
    await expect(page.getByText("Einkaufsliste erstellen")).toBeVisible({
      timeout: 10_000,
    });

    await ws.navigateTo("Waiting");
    await expect(page.getByText("Artikel über Testing lesen")).toBeVisible({
      timeout: 10_000,
    });

    await ws.navigateTo("Later");
    await expect(page.getByText("Zahnarzt anrufen")).toBeVisible({
      timeout: 10_000,
    });

    // ── 5. Chat with Tay — ask to create a project ─────────────────────
    await page.getByRole("button", { name: /Chat mit Copilot/ }).click();
    await expect(
      page.getByRole("complementary", { name: "Copilot Chat" }),
    ).toBeVisible();

    const chatInput = page.getByRole("textbox", { name: "Nachricht an Copilot" });
    await chatInput.fill(
      "Erstelle mir bitte ein Projekt 'Steuererklärung 2025' " +
        "mit dem gewünschten Ergebnis 'Steuererklärung fristgerecht abgeben' " +
        "und 3 konkreten Aktionen für den Bucket 'next'.",
    );
    await chatInput.press("Enter");

    // Wait for the LLM to return a tool call suggestion
    const acceptButton = page.getByRole("button", { name: /Übernehmen/ });
    const gotToolCall = await acceptButton
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => true)
      .catch(() => false);

    if (!gotToolCall) {
      // LLM asked a follow-up — send a clarifying nudge
      await chatInput.fill(
        "Bitte jetzt als create_project_with_actions Tool-Call vorschlagen.",
      );
      await chatInput.press("Enter");
      await expect(acceptButton).toBeVisible({ timeout: 60_000 });
    }

    // Accept the suggestion
    await acceptButton.click();

    // Verify confirmation (structural — proves execute-tool succeeded)
    await expect(page.getByText("Übernommen")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/erstellt/)).toBeVisible();

    // Close chat panel
    await page
      .getByRole("complementary", { name: "Copilot Chat" })
      .getByRole("button", { name: "Chat schließen" })
      .click();

    // ── 6. Verify project was created (structural) ──────────────────────
    await ws.navigateTo("Projects");
    // At least one project should exist — look for an expandable project row
    const projectButton = page
      .getByRole("button", { name: /^Expand / })
      .first();
    await expect(projectButton).toBeVisible({ timeout: 10_000 });

    // Expand the project
    await projectButton.click();

    // Structurally verify the LLM created actions inside the project:
    // each action has a "Complete <name>" checkbox. We asked for 3.
    const actionCheckboxes = page.getByLabel(/^Complete /);
    await expect(actionCheckboxes.first()).toBeVisible({ timeout: 10_000 });
    const actionCount = await actionCheckboxes.count();
    expect(actionCount).toBeGreaterThanOrEqual(1);

    // ── 7. Add 2 more actions to the project via rapid entry ────────────
    await ws.projectActionInput().fill("Belege sortieren");
    await ws.projectActionInput().press("Enter");
    await expect(page.getByText("Belege sortieren")).toBeVisible();

    await ws.projectActionInput().fill("Formulare ausfüllen");
    await ws.projectActionInput().press("Enter");
    await expect(page.getByText("Formulare ausfüllen")).toBeVisible();

    // Verify total: LLM-created + 2 user-added
    const finalCount = await actionCheckboxes.count();
    expect(finalCount).toBeGreaterThanOrEqual(actionCount + 2);
  });
});
