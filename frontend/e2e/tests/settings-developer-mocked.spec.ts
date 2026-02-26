import { test, expect } from "../fixtures/auth.fixture";
import { SettingsPage } from "../pages/settings.page";
import {
  mockItemsSync,
  mockOrgsApi,
  mockAgentApi,
  mockDevFlush,
  buildAgentSettings,
  reloadWithMocks,
} from "../helpers/mock-api";
import type { FlushResponse } from "../helpers/mock-api";

/**
 * Mocked integration tests for the Developer settings panel.
 * Tests the "Flush All Data" flow including confirmation, success, and error states.
 */

async function setupDevPanel(
  page: import("@playwright/test").Page,
  flushResponse?: FlushResponse | { status: number },
) {
  await mockItemsSync(page);
  await mockOrgsApi(page, []);
  await mockAgentApi(page, buildAgentSettings());
  await mockDevFlush(page, flushResponse);
  await reloadWithMocks(page);

  const settings = new SettingsPage(page);
  await settings.openSettings();
  await settings.navigateToTab("developer");
}

test.describe("Settings — Developer (mocked)", () => {
  test("flush requires confirmation text", async ({
    authenticatedPage: page,
  }) => {
    await setupDevPanel(page);

    await page.getByRole("button", { name: /Flush All Data/i }).click();

    // Confirm button should be visible but disabled
    const confirmBtn = page.getByRole("button", { name: /Confirm flush/i });
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeDisabled();

    // Partial text keeps it disabled
    await page.getByLabel(/FLUSH/).fill("FLU");
    await expect(confirmBtn).toBeDisabled();

    // Exact match enables it
    await page.getByLabel(/FLUSH/).fill("FLUSH");
    await expect(confirmBtn).toBeEnabled();
  });

  test("flush executes and shows result", async ({
    authenticatedPage: page,
  }) => {
    const response: FlushResponse = {
      ok: true,
      deleted: { items: 42, files: 5 },
    };
    await setupDevPanel(page, response);

    await page.getByRole("button", { name: /Flush All Data/i }).click();
    await page.getByLabel(/FLUSH/).fill("FLUSH");

    const flushPromise = page.waitForRequest(
      (req) => req.url().includes("/dev/flush") && req.method() === "POST",
    );
    await page.getByRole("button", { name: /Confirm flush/i }).click();
    await flushPromise;

    // Success message should show deleted counts
    await expect(page.getByText(/42/)).toBeVisible();
  });

  test("flush error shows error message", async ({
    authenticatedPage: page,
  }) => {
    await setupDevPanel(page, { status: 500 });

    await page.getByRole("button", { name: /Flush All Data/i }).click();
    await page.getByLabel(/FLUSH/).fill("FLUSH");
    await page.getByRole("button", { name: /Confirm flush/i }).click();

    // Error state should show with retry option
    await expect(page.getByText(/error/i)).toBeVisible();
    await expect(page.getByText(/Try again/i)).toBeVisible();
  });
});
