import type { Page, Locator } from "@playwright/test";

export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly switchToRegister: Locator;
  readonly switchToLogin: Locator;
  readonly errorMessage: Locator;
  readonly heading: Locator;

  constructor(private page: Page) {
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Password");
    this.submitButton = page.locator('button[type="submit"]');
    this.switchToRegister = page.getByRole("button", { name: "Request access" });
    this.switchToLogin = page.getByRole("button", { name: "Sign in" });
    this.errorMessage = page.locator(".text-status-error");
    this.heading = page.locator("h2");
  }

  async goto() {
    await this.page.goto("/");
  }

  async register(email: string, password: string) {
    await this.switchToRegister.click();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
