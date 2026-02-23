import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";

const MIN_TAP_SIZE = 44;
const MIN_TAP_GAP = 8;

async function assertMinSize(
  locator: import("@playwright/test").Locator,
  label: string,
) {
  // Wait for at least one element before calling .all() (which doesn't auto-wait)
  await locator.first().waitFor({ timeout: 5_000 });
  const elements = await locator.all();
  expect(elements.length, `expected at least one ${label}`).toBeGreaterThan(0);
  for (const el of elements) {
    const box = await el.boundingBox();
    expect(box, `${label} should be visible`).not.toBeNull();
    expect(
      box!.width,
      `${label} width ${box!.width} should be >= ${MIN_TAP_SIZE}`,
    ).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
    expect(
      box!.height,
      `${label} height ${box!.height} should be >= ${MIN_TAP_SIZE}`,
    ).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
  }
}

test.describe("Touch targets (44x44 minimum)", () => {
  test("BucketNav buttons have min 44x44 bounding box", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);
    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 1280) < 768;

    if (isMobile) {
      // Mobile: sidebar is hidden, test AppMenu bucket items instead
      await ws.menuTrigger.click();
      await assertMinSize(page.getByRole("menuitem"), "AppMenu bucket item");
    } else {
      // Desktop: sidebar BucketNav is visible
      await assertMinSize(ws.bucketNav.getByRole("button"), "BucketNav button");
    }
  });

  test("ActionRow checkbox has min 44x44 bounding box", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItems(["Touch target test item"]);
    await page.reload();
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next");
    // Items need to be in Next for checkbox to show (inbox uses triage buttons)
    // Seed to Next instead — or check inbox triage buttons
    // Actually, checkbox shows in all views. Let's triage first.
    await ws.navigateTo("Inbox");
    await ws.triageButton("Next").click();
    await expect(page.getByText("Touch target test item")).not.toBeVisible();
    await ws.navigateTo("Next");
    const checkbox = ws.completeCheckbox("Touch target test item");
    await expect(checkbox).toBeVisible();
    await assertMinSize(checkbox, "ActionRow checkbox");
  });

  test("ActionRow focus toggle has min 44x44 bounding box", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItems(["Focus target test"]);
    await page.reload();
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Inbox");
    await ws.triageButton("Next").click();
    await expect(page.getByText("Focus target test")).not.toBeVisible();
    await ws.navigateTo("Next");
    const star = ws.focusStar("Focus target test");
    await expect(star).toBeVisible();
    await assertMinSize(star, "ActionRow focus star");
  });

  test("EditableTitle has a visible edit affordance on touch devices", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItems(["Editable title test"]);
    await page.reload();
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Inbox");
    await ws.triageButton("Next").click();
    await expect(page.getByText("Editable title test")).not.toBeVisible();
    await ws.navigateTo("Next");
    // On touch devices, an edit icon should be visible
    const editButton = page.getByLabel(/Edit title:.*Editable title test/);
    await expect(editButton).toBeVisible();
    await assertMinSize(editButton, "EditableTitle edit affordance");
  });

  test("InboxTriage bucket buttons have min 44x44 bounding box", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItems(["Triage target test"]);
    await page.reload();
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Inbox");
    await assertMinSize(ws.triageButton("Next"), "InboxTriage Next button");
    await assertMinSize(
      ws.triageButton("Waiting"),
      "InboxTriage Waiting button",
    );
  });

  test("AppMenu dropdown items have min 44x44 bounding box", async ({
    authenticatedPage: page,
  }) => {
    const ws = new WorkspacePage(page);
    await assertMinSize(ws.menuTrigger, "AppMenu trigger");
    await ws.menuTrigger.click();
    await assertMinSize(page.getByRole("menuitem"), "AppMenu menu item");
  });

  test("Tabs component headers have min 44x44 bounding box", async ({
    authenticatedPage: page,
  }) => {
    // Tabs appear in settings views — navigate there via menu
    const ws = new WorkspacePage(page);
    await ws.menuTrigger.click();
    const settingsItem = page.getByRole("menuitem", { name: /Settings/i });
    // Only assert if settings exist (may not in all configurations)
    if (await settingsItem.isVisible()) {
      await settingsItem.click();
      const tabs = page.getByRole("tab");
      const tabCount = await tabs.count();
      if (tabCount > 0) {
        await assertMinSize(tabs, "Tab header");
      }
    }
  });

  test("adjacent tap targets have at least 8px spacing", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    await apiSeed.createInboxItems(["Spacing test item"]);
    await page.reload();
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Inbox");
    await ws.triageButton("Next").click();
    await expect(page.getByText("Spacing test item")).not.toBeVisible();
    await ws.navigateTo("Next");

    // Check spacing between checkbox and focus star in ActionRow
    const checkbox = ws.completeCheckbox("Spacing test item");
    const star = ws.focusStar("Spacing test item");
    await expect(checkbox).toBeVisible();
    await expect(star).toBeVisible();

    const checkboxBox = await checkbox.boundingBox();
    const starBox = await star.boundingBox();
    expect(checkboxBox).not.toBeNull();
    expect(starBox).not.toBeNull();

    // Compute horizontal gap between the two elements
    const checkboxRight = checkboxBox!.x + checkboxBox!.width;
    const gap = starBox!.x - checkboxRight;
    expect(
      gap,
      `gap between checkbox and star (${gap}px) should be >= ${MIN_TAP_GAP}px`,
    ).toBeGreaterThanOrEqual(MIN_TAP_GAP);
  });
});
