import { test, expect } from "../fixtures/auth.fixture";
import {
  mockItemsSync,
  mockOrgsApi,
  mockAgentApi,
  mockItemPatch,
  buildItemRecord,
  buildAgentSettings,
  resetMockCounter,
  reloadWithMocks,
} from "../helpers/mock-api";

/**
 * Mocked integration tests for keyboard navigation and ARIA accessibility patterns.
 * Tests AppMenu keyboard nav, EditableTitle keyboard handling,
 * capture input submit, and ARIA roles.
 */

async function setupWorkspace(
  page: import("@playwright/test").Page,
  items: ReturnType<typeof buildItemRecord>[] = [],
) {
  await mockItemPatch(page);
  await mockItemsSync(page, items);
  await mockOrgsApi(page, []);
  await mockAgentApi(page, buildAgentSettings());

  // Mock POST /items for capture input
  await page.route("**/items", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const newItem = buildItemRecord({
        bucket: "inbox",
        rawCapture: body.raw_capture ?? body.name ?? "New item",
      });
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newItem),
      });
    }
    return route.fallback();
  });

  await reloadWithMocks(page);
}

test.describe("Keyboard & Accessibility (mocked)", () => {
  test.beforeEach(() => {
    resetMockCounter();
  });

  test("AppMenu arrow key navigation", async ({ authenticatedPage: page }) => {
    await setupWorkspace(page);

    const menuButton = page.getByRole("button", { name: "Main menu" });
    await menuButton.click();

    // Menu should be open
    const menu = page.getByRole("menu", { name: "Main menu" });
    await expect(menu).toBeVisible();

    // First menuitem should have focus
    const firstItem = menu.getByRole("menuitem").first();
    await expect(firstItem).toBeFocused();

    // ArrowDown moves to next item
    await page.keyboard.press("ArrowDown");
    const secondItem = menu.getByRole("menuitem").nth(1);
    await expect(secondItem).toBeFocused();

    // ArrowUp moves back
    await page.keyboard.press("ArrowUp");
    await expect(firstItem).toBeFocused();

    // Escape closes menu and returns focus to trigger
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(menuButton).toBeFocused();
  });

  test("EditableTitle Enter saves", async ({ authenticatedPage: page }) => {
    const item = buildItemRecord({
      bucket: "inbox",
      rawCapture: "Aufgabe bearbeiten",
    });
    await setupWorkspace(page, [item]);

    // Click on the item to expand the triage panel
    await page.getByText("Aufgabe bearbeiten").click();

    // Click "More options" to reveal the split title editor
    await page.getByLabel("More options").click();

    // Find title input in the split editor
    const titleInput = page.getByLabel("Title (optional)");
    await expect(titleInput).toBeVisible();

    // Edit and press Enter
    await titleInput.clear();
    await titleInput.fill("Neuer Titel");

    const patchPromise = page.waitForRequest(
      (req) => req.url().includes("/items/") && req.method() === "PATCH",
    );
    await titleInput.press("Enter");
    const patchReq = await patchPromise;
    expect(patchReq.postDataJSON().item.name).toBe("Neuer Titel");
  });

  test("EditableTitle Escape cancels", async ({ authenticatedPage: page }) => {
    const item = buildItemRecord({
      bucket: "inbox",
      rawCapture: "Originaltext",
    });
    await setupWorkspace(page, [item]);

    // Click on the item to expand
    await page.getByText("Originaltext").click();

    // Click "More options" to reveal the split title editor
    await page.getByLabel("More options").click();

    // Find title input — the fallbackTitle is name ?? rawCapture, so "Originaltext"
    const titleInput = page.getByLabel("Title (optional)");
    await titleInput.clear();
    await titleInput.fill("Geänderter Text");

    // Escape should revert to fallbackTitle
    await titleInput.press("Escape");
    await expect(titleInput).toHaveValue("Originaltext");
  });

  test("capture input Enter submits", async ({ authenticatedPage: page }) => {
    await setupWorkspace(page);

    const captureInput = page.getByLabel("Capture a thought");
    await captureInput.fill("Neuer Gedanke");

    const postPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/items") &&
        !req.url().includes("/sync") &&
        req.method() === "POST",
    );
    await captureInput.press("Enter");
    await postPromise;

    // Input should be cleared after submit
    await expect(captureInput).toHaveValue("");
  });

  test("menu has correct ARIA roles", async ({ authenticatedPage: page }) => {
    await setupWorkspace(page);

    // Menu trigger has correct attributes
    const menuButton = page.getByRole("button", { name: "Main menu" });
    await expect(menuButton).toHaveAttribute("aria-haspopup", "menu");
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    // Open menu
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");

    // Menu container has role="menu"
    const menu = page.getByRole("menu", { name: "Main menu" });
    await expect(menu).toBeVisible();

    // Menu items have role="menuitem"
    const menuItems = menu.getByRole("menuitem");
    await expect(menuItems.first()).toBeVisible();
  });
});
