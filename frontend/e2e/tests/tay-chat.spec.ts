import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

/**
 * Canned response for /api/chat/completions — returns the birthday planning
 * suggestion as if the LLM produced it. We intercept this call so the E2E test
 * is deterministic and doesn't need a real LLM / OpenRouter key.
 *
 * The /api/chat/execute-tool call is NOT intercepted — it flows through the
 * real stack: backend → agents → backend POST /items.
 */
const BIRTHDAY_RESPONSE = {
  text: "Klingt nach einem Projekt! Hier ist mein Vorschlag:",
  toolCalls: [
    {
      name: "create_project_with_actions",
      arguments: {
        type: "create_project_with_actions",
        project: {
          name: "Geburtstagsfeier planen",
          desiredOutcome: "Erfolgreiche Geburtstagsfeier",
        },
        actions: [
          { name: "Gästeliste erstellen", bucket: "next" },
          { name: "Einladungen versenden", bucket: "next" },
          { name: "Location buchen", bucket: "next" },
        ],
        documents: [{ name: "Einladungsvorlage" }],
      },
    },
  ],
};

test.describe("Tay Chat", () => {
  test("birthday planning: send → suggest → accept → verify items in workspace", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);

    // Intercept /api/chat/completions with canned birthday response
    await page.route("**/api/chat/completions", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(BIRTHDAY_RESPONSE),
      }),
    );

    // 1. Open chat panel
    await page.getByRole("button", { name: /Chat mit Tay/ }).click();
    await expect(
      page.getByRole("complementary", { name: "Tay Chat" }),
    ).toBeVisible();

    // 2. Send birthday message
    const input = page.getByRole("textbox", { name: "Nachricht an Tay" });
    await input.fill(
      "Ich plane eine Geburtstagsfeier und brauche Hilfe",
    );
    await input.press("Enter");

    // 3. Verify suggestion card appears (birthday project + actions)
    await expect(page.getByText("Geburtstagsfeier planen")).toBeVisible();
    await expect(page.getByText("Gästeliste erstellen")).toBeVisible();
    await expect(page.getByText("Einladungen versenden")).toBeVisible();
    await expect(page.getByText("Location buchen")).toBeVisible();
    await expect(page.getByText("Einladungsvorlage")).toBeVisible();

    // 4. Accept the suggestion (this goes through the REAL execute-tool stack:
    //    frontend → backend → agents → backend POST /items)
    await page.getByRole("button", { name: /Übernehmen/ }).click();

    // 5. Verify confirmation appears
    await expect(page.getByText("Übernommen")).toBeVisible();
    await expect(page.getByText(/erstellt/)).toBeVisible();

    // 6. Close chat panel before navigating buckets
    await page.getByRole("button", { name: /Chat schließen/ }).click();

    // 7. Navigate to Projects — verify birthday project exists
    await ws.navigateTo("Projects");
    await expect(
      page.getByText("Geburtstagsfeier planen"),
    ).toBeVisible();

    // 8. Navigate to Next — verify actions exist
    await ws.navigateTo("Next");
    await expect(page.getByText("Gästeliste erstellen")).toBeVisible();
    await expect(page.getByText("Einladungen versenden")).toBeVisible();
    await expect(page.getByText("Location buchen")).toBeVisible();

    // 9. Navigate to Reference — verify document exists
    await ws.navigateTo("Reference");
    await expect(page.getByText("Einladungsvorlage")).toBeVisible();
  });
});
