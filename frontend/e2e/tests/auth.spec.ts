import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Authentication", () => {
  test("uses password-manager-friendly field semantics in each mode", async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.heading).toHaveText("Sign in to continue");
    await expect(loginPage.emailInput).toHaveAttribute(
      "autocomplete",
      "username",
    );
    await expect(loginPage.passwordInput).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    await expect(loginPage.passwordInput).toHaveAttribute(
      "name",
      "current-password",
    );
    await expect(loginPage.passwordInput).toHaveAttribute(
      "id",
      "current-password",
    );

    await loginPage.switchToRegister.click();

    await expect(loginPage.heading).toHaveText("Create account");
    await expect(loginPage.emailInput).toHaveAttribute("autocomplete", "email");
    await expect(loginPage.passwordInput).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    await expect(loginPage.passwordInput).toHaveAttribute(
      "name",
      "new-password",
    );
    await expect(loginPage.passwordInput).toHaveAttribute("id", "new-password");

    await loginPage.switchToLogin.click();

    await expect(loginPage.heading).toHaveText("Sign in to continue");
    await expect(loginPage.emailInput).toHaveAttribute(
      "autocomplete",
      "username",
    );
    await expect(loginPage.passwordInput).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  test("register → workspace → logout → login", async ({ page }) => {
    const uniqueId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const email = `e2e-${uniqueId}@test.example.com`;
    const password = "Testpass1!";

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Should see login form
    await expect(loginPage.heading).toHaveText("Sign in to continue");

    // Switch to register and create account
    await loginPage.register(email, password);

    // Should land on workspace (menu trigger visible = logged in)
    const workspace = new WorkspacePage(page);
    await expect(workspace.menuTrigger).toBeVisible({ timeout: 10_000 });

    // Sign out via menu
    await workspace.signOut();

    // Should see login form again
    await expect(loginPage.heading).toHaveText("Sign in to continue");

    // Login with same credentials
    await loginPage.login(email, password);

    // Should be back on workspace
    await expect(workspace.menuTrigger).toBeVisible({ timeout: 10_000 });
  });

  test("shows error for invalid credentials", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login("nonexistent@test.example.com", "WrongPass1!");

    await expect(loginPage.errorMessage).toBeVisible();
  });

  test("shows error for duplicate registration", async ({ page, context }) => {
    const uniqueId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const email = `e2e-${uniqueId}@test.example.com`;
    const username = `e2e${uniqueId}`;
    const password = "Testpass1!";

    // Register via API first (backend requires username)
    await page.request.post("/api/auth/register", {
      data: { email, username, password },
    });

    // Clear cookies so we land on the login page (API register sets a session)
    await context.clearCookies();

    // Try to register again via UI
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.register(email, password);

    await expect(loginPage.errorMessage).toBeVisible();
  });
});
