import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";
import { GOLDEN_SCENARIOS } from "../fixtures/golden-prompts";

/**
 * Real E2E tests for Copilot Chat — uses actual LLM via OpenRouter.
 *
 * Unlike `copilot-chat-mocked.spec.ts` (integration), these tests do NOT
 * intercept any API calls. The full stack is exercised:
 *   frontend → backend → agents → OpenRouter LLM → tool execution → backend POST /items
 *
 * Gated on OPENROUTER_API_KEY — auto-skips when no API key is available.
 * Assertions are structural (not exact text) because LLM output is non-deterministic.
 *
 * Each golden scenario generates a separate Playwright test.
 */

test.skip(
  !process.env.OPENROUTER_API_KEY,
  "requires OPENROUTER_API_KEY for real LLM calls",
);

test.describe("Copilot Chat — Real LLM", () => {
  test.setTimeout(120_000);

  for (const scenario of GOLDEN_SCENARIOS) {
    test(`${scenario.description}: prompt → LLM suggests → accept → items created`, async ({
      authenticatedPage: page,
    }) => {
      const ws = new WorkspacePage(page);

      // 1. Open chat panel
      await page.getByRole("button", { name: /Chat mit Copilot/ }).click();
      await expect(
        page.getByRole("complementary", { name: "Copilot Chat" }),
      ).toBeVisible();

      // 2. Send prompt from golden dataset
      const input = page.getByRole("textbox", { name: "Nachricht an Copilot" });
      await input.fill(scenario.prompt);
      await input.press("Enter");

      // 3. Wait for "Übernehmen" button — proves the LLM returned a tool call.
      //    If the LLM asks a follow-up instead, send clarification.
      const acceptButton = page.getByRole("button", { name: /Übernehmen/ });
      const gotToolCall = await acceptButton
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => true)
        .catch(() => false);

      if (!gotToolCall) {
        // LLM asked a follow-up — send a clarifying response
        await input.fill(
          `Bitte jetzt als ${scenario.expectedToolCall} Tool-Call vorschlagen.`,
        );
        await input.press("Enter");
        await expect(acceptButton).toBeVisible({ timeout: 60_000 });
      }

      // 4. Accept the suggestion
      await acceptButton.click();

      // 5. Verify confirmation — proves execute-tool succeeded
      await expect(page.getByText("Übernommen")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(/erstellt/)).toBeVisible();

      // 6. Close chat panel
      await page
        .getByRole("complementary", { name: "Copilot Chat" })
        .getByRole("button", { name: "Chat schließen" })
        .click();

      // 7. Verify workspace state per golden assertions
      for (const assertion of scenario.assertions) {
        await ws.navigateTo(assertion.bucket);
        if (assertion.structural) {
          // Structural: only assert bucket is non-empty (LLM picks its own names)
          const main = page.getByRole("main", { name: "Bucket content" });
          await expect(main).not.toContainText("is empty", {
            timeout: 10_000,
          });
        } else {
          // Exact: item names match (project name echoed from prompt, or known items)
          for (const itemName of assertion.itemNames) {
            await expect(page.getByText(itemName)).toBeVisible({
              timeout: 10_000,
            });
          }
        }
      }
    });
  }
});
