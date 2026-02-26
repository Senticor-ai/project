import { test, expect } from "../fixtures/auth.fixture";
import { SettingsPage } from "../pages/settings.page";
import {
  mockItemsSync,
  mockOrgsApi,
  mockAgentApi,
  buildOrg,
  buildAgentSettings,
  reloadWithMocks,
} from "../helpers/mock-api";

/**
 * Mocked integration tests for the Organizations settings panel.
 * All API responses are intercepted via page.route() — no real backend
 * is needed beyond auth (register + login).
 */

async function setupOrgPanel(
  page: import("@playwright/test").Page,
  orgs: import("../helpers/mock-api").OrgResponse[],
) {
  await mockItemsSync(page);
  await mockOrgsApi(page, orgs);
  await mockAgentApi(page, buildAgentSettings());
  await reloadWithMocks(page);

  const settings = new SettingsPage(page);
  await settings.openSettings();
  await settings.navigateToTab("organizations");
}

test.describe("Settings — Organizations (mocked)", () => {
  test("empty state shows create prompt", async ({
    authenticatedPage: page,
  }) => {
    await setupOrgPanel(page, []);

    await expect(page.getByText("No organizations yet")).toBeVisible();
    await expect(page.getByText("Add organization")).toBeVisible();
  });

  test("org list renders names and roles", async ({
    authenticatedPage: page,
  }) => {
    const orgs = [
      buildOrg({ name: "Bundesamt für IT", role: "owner" }),
      buildOrg({ name: "Externe Berater", role: "member" }),
    ];
    await setupOrgPanel(page, orgs);

    await expect(page.getByText("Bundesamt für IT")).toBeVisible();
    await expect(page.getByText("Externe Berater")).toBeVisible();
    await expect(page.getByText("Owner", { exact: true })).toBeVisible();
  });

  test("create org flow via Enter", async ({ authenticatedPage: page }) => {
    await setupOrgPanel(page, []);

    // Click "Add organization" to show form
    await page.getByText("Add organization").click();

    // Type org name and press Enter
    const input = page.getByLabel("Organization name");
    await expect(input).toBeFocused();
    await input.fill("Neue Organisation");

    // Intercept the POST and verify
    const postPromise = page.waitForRequest(
      (req) => req.url().includes("/orgs") && req.method() === "POST",
    );
    await input.press("Enter");
    const postReq = await postPromise;
    expect(postReq.postDataJSON()).toEqual({ name: "Neue Organisation" });

    // After create, the new org should appear in the list
    await expect(page.getByText("Neue Organisation")).toBeVisible();
  });

  test("cancel creation via Escape", async ({ authenticatedPage: page }) => {
    await setupOrgPanel(page, []);

    await page.getByText("Add organization").click();
    const input = page.getByLabel("Organization name");
    await input.fill("Will be cancelled");
    await input.press("Escape");

    // Form should be hidden, "Add organization" button visible again
    await expect(input).not.toBeVisible();
    await expect(page.getByText("Add organization")).toBeVisible();
  });
});
