import { test as base, type Page } from "@playwright/test";
import { ApiSeed } from "../helpers/api-seed";

const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME ?? "terminandoyo_csrf";

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

    // Register + login via API through the Vite proxy (shares cookie jar)
    await page.request.post("/api/auth/register", {
      data: { email, username, password },
    });
    await page.request.post("/api/auth/login", {
      data: { email, password },
    });

    // Navigate to the app — should land on workspace (not login page)
    await page.goto("/");
    await page.waitForSelector('nav[aria-label="Buckets"]', {
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
