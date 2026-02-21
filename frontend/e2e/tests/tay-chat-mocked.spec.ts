import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";
import { GOLDEN_SCENARIOS } from "../fixtures/golden-prompts";

/**
 * Integration tests for Copilot Chat — uses canned LLM responses from the golden dataset.
 *
 * Only `/chat/completions` is mocked (the LLM inference call).
 * The `/chat/execute-tool` call flows through the real stack:
 *   frontend → backend → agents → backend POST /items
 *
 * Each golden scenario generates a separate Playwright test.
 */

test.describe("Copilot Chat (mocked)", () => {
  for (const scenario of GOLDEN_SCENARIOS) {
    test(`${scenario.description}: send → suggest → accept → verify`, async ({
      authenticatedPage: page,
    }) => {
      const ws = new WorkspacePage(page);

      // Intercept chat completions with the canned golden response as NDJSON.
      // Matches both "/chat/completions" and "/api/chat/completions" API bases.
      await page.route("**/chat/completions", (route) => {
        const { text, toolCalls } = scenario.cannedResponse;
        const events: string[] = [];
        if (text) {
          events.push(JSON.stringify({ type: "text_delta", content: text }));
        }
        if (toolCalls?.length) {
          events.push(JSON.stringify({ type: "tool_calls", toolCalls }));
        }
        events.push(JSON.stringify({ type: "done", text: text ?? "" }));
        return route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: events.join("\n") + "\n",
        });
      });

      // 1. Open chat panel
      await page.getByRole("button", { name: /Chat mit Copilot/ }).click();
      await expect(
        page.getByRole("complementary", { name: "Copilot Chat" }),
      ).toBeVisible();

      // 2. Send prompt from golden dataset
      const input = page.getByRole("textbox", { name: "Nachricht an Copilot" });
      await input.fill(scenario.prompt);
      await input.press("Enter");

      // 3. Verify suggestion card shows expected items from canned response
      //    Scope to the suggestion card's accept button area to avoid matching
      //    the user's own chat bubble (which may echo the same project name).
      const toolCall = scenario.cannedResponse.toolCalls[0];
      if (toolCall) {
        const args = toolCall.arguments;
        const project = args.project as { name: string } | undefined;
        if (project) {
          await expect(
            page.getByText(project.name, { exact: true }),
          ).toBeVisible();
        }
        const actions = (args.actions as Array<{ name: string }>) ?? [];
        for (const action of actions) {
          await expect(
            page.getByText(action.name, { exact: true }),
          ).toBeVisible();
        }
        const documents = (args.documents as Array<{ name: string }>) ?? [];
        for (const doc of documents) {
          await expect(
            page.getByText(doc.name, { exact: true }),
          ).toBeVisible();
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
        .getByRole("complementary", { name: "Copilot Chat" })
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
