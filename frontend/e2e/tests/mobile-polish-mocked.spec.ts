import { test as base, expect as baseExpect } from "@playwright/test";
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
 * Mocked integration tests for the Mobile Polish & Resilience epic.
 * Covers safe-area meta tag, URL display formatting, login error
 * classification, tag/context section restructuring.
 */

async function setupWorkspace(
  page: import("@playwright/test").Page,
  items: ReturnType<typeof buildItemRecord>[] = [],
) {
  await mockItemPatch(page);
  await mockItemsSync(page, items);
  await mockOrgsApi(page, []);
  await mockAgentApi(page, buildAgentSettings());
  await reloadWithMocks(page);
}

// ---------------------------------------------------------------------------
// Phase 1: Safe-area smoke
// ---------------------------------------------------------------------------

test.describe("Safe-area support (mocked)", () => {
  test("viewport meta tag includes viewport-fit=cover", async ({
    authenticatedPage: page,
  }) => {
    const content = await page.getAttribute(
      'meta[name="viewport"]',
      "content",
    );
    expect(content).toContain("viewport-fit=cover");
  });
});

// ---------------------------------------------------------------------------
// Phase 2: URL display formatting
// ---------------------------------------------------------------------------

test.describe("URL display formatting (mocked)", () => {
  test.beforeEach(() => {
    resetMockCounter();
  });

  test("URL item shows formatted domain instead of raw URL", async ({
    authenticatedPage: page,
  }) => {
    const urlItem = buildItemRecord({
      bucket: "next",
      name: "https://www.bundesfinanzministerium.de/Content/DE/Pressemitteilungen",
    });
    await setupWorkspace(page, [urlItem]);

    // Navigate to Next bucket where the item lives
    await page.getByRole("button", { name: "Go to Inbox" }).click();
    const nextNav = page.getByRole("button", { name: /Next/ });
    if (await nextNav.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nextNav.click();
    }

    // Should show formatted domain, not raw URL
    await expect(
      page.getByText("bundesfinanzministerium.de"),
    ).toBeVisible();
    // Raw URL should NOT appear as-is
    await expect(
      page.getByText("https://www.bundesfinanzministerium.de", {
        exact: true,
      }),
    ).not.toBeVisible();
  });

  test("non-URL item shows regular title", async ({
    authenticatedPage: page,
  }) => {
    const normalItem = buildItemRecord({
      bucket: "next",
      name: "Steuerbescheid prüfen",
    });
    await setupWorkspace(page, [normalItem]);

    await page.getByRole("button", { name: "Go to Inbox" }).click();
    const nextNav = page.getByRole("button", { name: /Next/ });
    if (await nextNav.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nextNav.click();
    }

    await expect(page.getByText("Steuerbescheid prüfen")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Login page error classification
// ---------------------------------------------------------------------------

/**
 * Login page tests use base Playwright test (not authenticatedPage) because
 * we need to interact with the pre-auth login page and intercept auth routes.
 */

async function navigateToLogin(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForSelector('button[type="submit"]', { timeout: 10_000 });
}

async function submitLogin(page: import("@playwright/test").Page) {
  await page.fill('input[name="email"]', "test@example.com");
  await page.fill('input[name="current-password"]', "Testpass1!");
  await page.click('button[type="submit"]');
}

base.describe("Login error classification (mocked)", () => {
  base("401 shows invalid credentials message", async ({ page }) => {
    await page.route("**/auth/login", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          status: 401,
          message: "Invalid credentials",
        }),
      }),
    );

    await navigateToLogin(page);
    await submitLogin(page);

    const alert = page.getByRole("alert");
    await baseExpect(alert).toBeVisible();
    await baseExpect(alert).toContainText("E-Mail oder Passwort ist falsch");
  });

  base("429 shows rate limited message", async ({ page }) => {
    await page.route("**/auth/login", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          status: 429,
          message: "Too many requests",
        }),
      }),
    );

    await navigateToLogin(page);
    await submitLogin(page);

    const alert = page.getByRole("alert");
    await baseExpect(alert).toBeVisible();
    await baseExpect(alert).toContainText("Zu viele Anmeldeversuche");
  });

  base("network error shows unreachable message", async ({ page }) => {
    await page.route("**/auth/login", (route) => route.abort("connectionrefused"));

    await navigateToLogin(page);
    await submitLogin(page);

    const alert = page.getByRole("alert");
    await baseExpect(alert).toBeVisible();
    await baseExpect(alert).toContainText("Server nicht erreichbar");
  });

  base("retry button appears after error", async ({ page }) => {
    await page.route("**/auth/login", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ status: 401, message: "Invalid" }),
      }),
    );

    await navigateToLogin(page);
    await submitLogin(page);

    await baseExpect(page.getByText("Erneut versuchen")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Phase 4: Tag/context section restructuring
// ---------------------------------------------------------------------------

test.describe("Tag/context sections (mocked)", () => {
  test.beforeEach(() => {
    resetMockCounter();
  });

  test("editor shows contexts and tags sections with headers and hints", async ({
    authenticatedPage: page,
  }) => {
    const item = buildItemRecord({
      bucket: "inbox",
      rawCapture: "Vorgang bearbeiten",
    });
    await setupWorkspace(page, [item]);

    // Click item to expand triage panel
    await page.getByText("Vorgang bearbeiten").click();

    // Click "More options" to reveal the ItemEditor
    await page.getByLabel("More options").click();

    // Contexts section header and hint
    await expect(page.getByText("Kontexte")).toBeVisible();
    await expect(page.getByText(/Wo oder womit/)).toBeVisible();

    // Tags section header and hint
    await expect(page.getByText("Schlagwörter")).toBeVisible();
    await expect(page.getByText(/Themen und Kategorien/)).toBeVisible();
  });
});
