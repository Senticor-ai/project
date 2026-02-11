import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

/**
 * Real E2E test for Tay Chat — uses actual LLM via OpenRouter.
 *
 * Unlike `tay-chat-mocked.spec.ts` (Integration test), this test does NOT
 * intercept any API calls. The full stack is exercised:
 *   frontend → backend → agents → OpenRouter LLM → tool execution → backend POST /items
 *
 * Gated on OPENROUTER_API_KEY — auto-skips when no API key is available.
 * Assertions are structural (not exact text) because LLM output is non-deterministic.
 */

test.skip(
  !process.env.OPENROUTER_API_KEY,
  "requires OPENROUTER_API_KEY for real LLM calls",
);

test.describe("Tay Chat — Real LLM", () => {
  test.setTimeout(120_000);

  test("project planning: send prompt → LLM suggests → accept → items created", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);

    // 1. Open chat panel
    await page.getByRole("button", { name: /Chat mit Tay/ }).click();
    await expect(
      page.getByRole("complementary", { name: "Tay Chat" }),
    ).toBeVisible();

    // 2. Send a clear prompt that should trigger create_project_with_actions
    const input = page.getByRole("textbox", { name: "Nachricht an Tay" });
    await input.fill(
      "Erstelle mir bitte ein Projekt 'Umzug planen' mit 3 konkreten Aktionen für den Bucket 'next'.",
    );
    await input.press("Enter");

    // 3. Wait for "Übernehmen" button — proves the LLM returned a tool call
    //    (60s timeout for slow LLM responses)
    await expect(
      page.getByRole("button", { name: /Übernehmen/ }),
    ).toBeVisible({ timeout: 60_000 });

    // 4. Accept the suggestion
    await page.getByRole("button", { name: /Übernehmen/ }).click();

    // 5. Verify confirmation — proves execute-tool succeeded
    await expect(page.getByText("Übernommen")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/erstellt/)).toBeVisible();

    // 6. Close chat panel
    await page
      .getByRole("complementary", { name: "Tay Chat" })
      .getByRole("button", { name: "Chat schließen" })
      .click();

    // 7. Navigate to Projects — verify at least one project was created
    await ws.navigateTo("Projects");
    await expect(
      page.getByRole("main", { name: "Bucket content" }).locator("article"),
    ).not.toHaveCount(0, { timeout: 10_000 });

    // 8. Navigate to Next — verify actions were created
    await ws.navigateTo("Next");
    await expect(
      page.getByRole("main", { name: "Bucket content" }).locator("article"),
    ).not.toHaveCount(0, { timeout: 10_000 });
  });
});
