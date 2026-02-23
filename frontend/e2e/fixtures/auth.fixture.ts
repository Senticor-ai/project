import { test as base, type Page } from "@playwright/test";
import { ApiSeed } from "../helpers/api-seed";

const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME ?? "project_csrf";

type TestFixtures = {
  authenticatedPage: Page;
  apiSeed: ApiSeed;
};

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    const uniqueId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const email = `e2e-${uniqueId}@test.example.com`;
    const username = `e2e${uniqueId}`;
    const password = "Testpass1!";

    // Clear IndexedDB on every navigation (including reload) to prevent
    // PersistQueryClientProvider from restoring stale TanStack Query cache.
    // Without this, items created via apiSeed (direct API) are invisible
    // because the cached empty result is still considered "fresh" (staleTime=30s).
    await page.addInitScript(() => {
      indexedDB.deleteDatabase("keyval-store");
    });

    // Register + login via API through the Vite proxy (shares cookie jar)
    await page.request.post("/api/auth/register", {
      data: { email, username, password },
    });
    await page.request.post("/api/auth/login", {
      data: { email, password },
    });

    // Navigate to the app — should land on workspace (not login page).
    // Wait for the logo button which is visible on both desktop and mobile.
    // The sidebar nav[aria-label="Buckets"] is hidden below md breakpoint.
    await page.goto("/");
    await page.waitForSelector('button[aria-label="Go to Inbox"]', {
      timeout: 10_000,
    });

    await use(page);
  },

  apiSeed: async ({ authenticatedPage: page }, use) => {
    // Extract CSRF token from cookies (set by login response).
    // When CSRF is disabled locally, the cookie won't exist — csrfToken stays empty.
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === CSRF_COOKIE_NAME);
    const seed = new ApiSeed(page.request, csrfCookie?.value ?? "");
    await use(seed);
  },
});

export { expect } from "@playwright/test";
