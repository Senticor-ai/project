import type { Page, Locator } from "@playwright/test";

export class DisclaimerPage {
  readonly modal: Locator;
  readonly title: Locator;
  readonly acknowledgeButton: Locator;
  readonly banner: Locator;

  constructor(private page: Page) {
    this.modal = page.getByRole("dialog", {
      name: /dev\/demo environment|entwicklungs-\/demo-umgebung/i,
    });
    this.title = page.locator("#disclaimer-title");
    this.acknowledgeButton = page.getByRole("button", {
      name: /I understand|Ich verstehe/i,
    });
    this.banner = page.getByText(
      /development\/demonstration environment|entwicklungs-\/demonstrationsumgebung/i,
    );
  }

  async acknowledge() {
    await this.acknowledgeButton.click();
  }
}
