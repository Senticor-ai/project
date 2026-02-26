import { test, expect } from "../fixtures/auth.fixture";
import { SettingsPage } from "../pages/settings.page";
import {
  mockItemsSync,
  mockOrgsApi,
  mockAgentApi,
  buildAgentSettings,
  reloadWithMocks,
} from "../helpers/mock-api";
import type { AgentSettingsResponse } from "../helpers/mock-api";

/**
 * Mocked integration tests for the Agent Setup settings panel.
 * Tests backend selection, provider/key config, save flow, and container status.
 */

async function setupAgentPanel(
  page: import("@playwright/test").Page,
  settings: AgentSettingsResponse,
) {
  await mockItemsSync(page);
  await mockOrgsApi(page, []);
  await mockAgentApi(page, settings);
  await reloadWithMocks(page);

  const settingsPage = new SettingsPage(page);
  await settingsPage.openSettings();
  await settingsPage.navigateToTab("agent-setup");
}

test.describe("Settings — Agent Setup (mocked)", () => {
  test("default settings display correctly", async ({
    authenticatedPage: page,
  }) => {
    await setupAgentPanel(page, buildAgentSettings());

    // Backend toggle options visible
    await expect(page.getByText("Copilot")).toBeVisible();
    await expect(page.getByRole("button", { name: /OpenClaw/ })).toBeVisible();

    // Provider dropdown visible
    await expect(page.locator("#agent-provider")).toBeVisible();

    // No API key → prompt to add one
    await expect(page.getByText(/Add your API key/)).toBeVisible();
  });

  test("API key saved state", async ({ authenticatedPage: page }) => {
    await setupAgentPanel(page, buildAgentSettings({ hasApiKey: true }));

    await expect(page.getByText("Key saved")).toBeVisible();
    await expect(page.getByText("Remove")).toBeVisible();
  });

  test("save sends PUT with form data", async ({ authenticatedPage: page }) => {
    await setupAgentPanel(page, buildAgentSettings());

    // Enter API key
    await page.locator("#agent-api-key").fill("sk-test-key-123");

    // Change model
    const modelInput = page.locator("#agent-model");
    await modelInput.clear();
    await modelInput.fill("anthropic/claude-opus-4");

    // Save and verify PUT
    const putPromise = page.waitForRequest(
      (req) => req.url().includes("/agent/settings") && req.method() === "PUT",
    );
    await page.getByRole("button", { name: /Save and validate/i }).click();
    const putReq = await putPromise;
    const body = putReq.postDataJSON();
    expect(body.apiKey).toBe("sk-test-key-123");
    expect(body.model).toBe("anthropic/claude-opus-4");
  });

  test("container status when openclaw backend", async ({
    authenticatedPage: page,
  }) => {
    await setupAgentPanel(
      page,
      buildAgentSettings({
        agentBackend: "openclaw",
        hasApiKey: true,
        containerStatus: "running",
      }),
    );

    // Container section should be visible with running status
    await expect(page.getByText("Container")).toBeVisible();
    await expect(page.getByText("Aktiv")).toBeVisible();
    await expect(page.getByRole("button", { name: /Stop/i })).toBeVisible();
  });
});
