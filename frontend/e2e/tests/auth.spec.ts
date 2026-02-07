import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";
import { WorkspacePage } from "../pages/workspace.page";

test.describe("Authentication", () => {
  test("register → workspace → logout → login", async ({ page }) => {
    const uniqueId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const email = `e2e-${uniqueId}@test.example.com`;
    const username = `e2e${uniqueId}`;
    const password = "Testpass1!";

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Should see login form
    await expect(loginPage.heading).toHaveText("Sign in");

    // Switch to register and create account
    await loginPage.register(email, username, password);

    // Should land on workspace
    const workspace = new WorkspacePage(page);
    await expect(workspace.signOutButton).toBeVisible();
    await expect(page.getByText(username)).toBeVisible();

    // Sign out
    await workspace.signOutButton.click();

    // Should see login form again
    await expect(loginPage.heading).toHaveText("Sign in");

    // Login with same credentials
    await loginPage.login(email, password);

    // Should be back on workspace
    await expect(workspace.signOutButton).toBeVisible();
    await expect(page.getByText(username)).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login("nonexistent@test.example.com", "WrongPass1!");

    await expect(loginPage.errorMessage).toBeVisible();
  });

  test("shows error for duplicate registration", async ({ page }) => {
    const uniqueId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const email = `e2e-${uniqueId}@test.example.com`;
    const username = `e2e${uniqueId}`;
    const password = "Testpass1!";

    // Register via API first
    await page.request.post("/api/auth/register", {
      data: { email, username, password },
    });

    // Try to register again via UI
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.register(email, username, password);

    await expect(loginPage.errorMessage).toBeVisible();
  });
});
