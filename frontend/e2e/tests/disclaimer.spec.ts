import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";
import { WorkspacePage } from "../pages/workspace.page";
import { DisclaimerPage } from "../pages/disclaimer.page";

test.describe("Disclaimer", () => {
  test("shows persistent banner on login page", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const disclaimerPage = new DisclaimerPage(page);

    await loginPage.goto();

    // Banner should be visible in login mode
    await expect(disclaimerPage.banner).toBeVisible();

    // Banner should remain visible in register mode
    await loginPage.switchToRegister.click();
    await expect(disclaimerPage.banner).toBeVisible();

    // Banner should remain visible when switching back to login
    await loginPage.switchToLogin.click();
    await expect(disclaimerPage.banner).toBeVisible();
  });

  test("shows first-login modal → acknowledge → no modal on next login", async ({
    page,
  }) => {
    const uniqueId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const email = `e2e-disclaimer-${uniqueId}@test.example.com`;
    const password = "Testpass1!";

    const loginPage = new LoginPage(page);
    const workspace = new WorkspacePage(page);
    const disclaimerPage = new DisclaimerPage(page);

    // Register new user
    await loginPage.goto();
    await loginPage.register(email, password);

    // First-login modal should appear after successful registration
    await expect(disclaimerPage.modal).toBeVisible({ timeout: 10_000 });
    await expect(disclaimerPage.title).toBeVisible();

    // Workspace should be blocked (not fully visible/interactable) until acknowledged
    // The modal is rendered in a portal, so we just check it's present

    // Acknowledge the disclaimer
    await disclaimerPage.acknowledge();

    // Modal should close
    await expect(disclaimerPage.modal).not.toBeVisible();

    // Should be able to access workspace now
    await expect(workspace.menuTrigger).toBeVisible({ timeout: 10_000 });

    // Sign out
    await workspace.signOut();

    // Should be back on login page
    await expect(loginPage.heading).toHaveText("Sign in to continue");

    // Login again with same credentials
    await loginPage.login(email, password);

    // Should land on workspace WITHOUT seeing the modal again
    await expect(workspace.menuTrigger).toBeVisible({ timeout: 10_000 });
    await expect(disclaimerPage.modal).not.toBeVisible();
  });

  test("existing user without acknowledgment sees modal on login", async ({
    page,
    context,
  }) => {
    const uniqueId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const email = `e2e-existing-${uniqueId}@test.example.com`;
    const username = `e2e${uniqueId}`;
    const password = "Testpass1!";

    // Create user via API (backend requires username) without acknowledging disclaimer
    // This simulates an existing user created before the disclaimer feature
    await page.request.post("/api/auth/register", {
      data: { email, username, password },
    });

    // Clear cookies so we land on the login page
    await context.clearCookies();

    const loginPage = new LoginPage(page);
    const workspace = new WorkspacePage(page);
    const disclaimerPage = new DisclaimerPage(page);

    // Login with the existing account
    await loginPage.goto();
    await loginPage.login(email, password);

    // Modal should appear for existing users who haven't acknowledged
    await expect(disclaimerPage.modal).toBeVisible({ timeout: 10_000 });

    // Acknowledge the disclaimer
    await disclaimerPage.acknowledge();
    await expect(disclaimerPage.modal).not.toBeVisible();

    // Should be able to access workspace
    await expect(workspace.menuTrigger).toBeVisible({ timeout: 10_000 });
  });
});
