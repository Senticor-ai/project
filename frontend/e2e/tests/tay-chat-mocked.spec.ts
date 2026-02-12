import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";
import { GOLDEN_SCENARIOS } from "../fixtures/golden-prompts";

/**
 * Integration tests for Tay Chat — uses canned LLM responses from the golden dataset.
 *
 * Only `/api/chat/completions` is mocked (the LLM inference call).
 * The `/api/chat/execute-tool` call flows through the real stack:
 *   frontend → backend → agents → backend POST /items
 *
 * Each golden scenario generates a separate Playwright test.
 */

test.describe("Tay Chat (mocked)", () => {
  for (const scenario of GOLDEN_SCENARIOS) {
    test(`${scenario.description}: send → suggest → accept → verify`, async ({
      authenticatedPage: page,
    }) => {
      const ws = new WorkspacePage(page);

      // Intercept /api/chat/completions with the canned golden response
      await page.route("**/api/chat/completions", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(scenario.cannedResponse),
        }),
      );

      // 1. Open chat panel
      await page.getByRole("button", { name: /Chat mit Tay/ }).click();
      await expect(
        page.getByRole("complementary", { name: "Tay Chat" }),
      ).toBeVisible();

      // 2. Send prompt from golden dataset
      const input = page.getByRole("textbox", { name: "Nachricht an Tay" });
      await input.fill(scenario.prompt);
      await input.press("Enter");

      // 3. Verify suggestion card shows expected items from canned response
      const toolCall = scenario.cannedResponse.toolCalls[0];
      if (toolCall) {
        const args = toolCall.arguments;
        const project = args.project as { name: string } | undefined;
        if (project) {
          await expect(page.getByText(project.name)).toBeVisible();
        }
        const actions = (args.actions as Array<{ name: string }>) ?? [];
        for (const action of actions) {
          await expect(page.getByText(action.name)).toBeVisible();
        }
        const documents = (args.documents as Array<{ name: string }>) ?? [];
        for (const doc of documents) {
          await expect(page.getByText(doc.name)).toBeVisible();
        }
      }

      // 4. Accept the suggestion (goes through REAL execute-tool stack)
      await page.getByRole("button", { name: /Übernehmen/ }).click();

      // 5. Verify confirmation (execute-tool goes through real backend)
      await expect(page.getByText("Übernommen")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/erstellt/)).toBeVisible({
        timeout: 10_000,
      });

      // 6. Close chat panel
      await page
        .getByRole("complementary", { name: "Tay Chat" })
        .getByRole("button", { name: "Chat schließen" })
        .click();

      // 7. Verify workspace state per golden assertions (exact text match)
      for (const assertion of scenario.assertions) {
        await ws.navigateTo(assertion.bucket);
        for (const itemName of assertion.itemNames) {
          await expect(page.getByText(itemName)).toBeVisible();
        }
      }
    });
  }
});
