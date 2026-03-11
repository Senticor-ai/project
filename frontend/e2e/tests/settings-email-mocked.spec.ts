import { test, expect } from "../fixtures/auth.fixture";
import { SettingsPage } from "../pages/settings.page";
import {
  mockItemsSync,
  mockOrgsApi,
  mockEmailApi,
  mockAgentApi,
  buildEmailConnection,
  buildCalendar,
  buildAgentSettings,
  buildSyncResponse,
  reloadWithMocks,
} from "../helpers/mock-api";
import type {
  EmailConnectionResponse,
  EmailCalendarResponse,
} from "../helpers/mock-api";
import type { Route } from "@playwright/test";

/**
 * Mocked integration tests for the 3rd Party Sync (email) settings panel.
 * All API responses are intercepted via page.route() — no real backend
 * is needed beyond auth (register + login).
 */

async function setupEmailPanel(
  page: import("@playwright/test").Page,
  connections: EmailConnectionResponse[],
  calendars?: Record<string, EmailCalendarResponse[]>,
) {
  await mockItemsSync(page);
  await mockOrgsApi(page, []);
  await mockEmailApi(page, connections, calendars);
  await mockAgentApi(page, buildAgentSettings());
  await reloadWithMocks(page);

  const settings = new SettingsPage(page);
  await settings.openSettings();
  await settings.navigateToTab("sync");
}

test.describe("Settings — Email (mocked)", () => {
  test("empty state shows connect button", async ({
    authenticatedPage: page,
  }) => {
    await setupEmailPanel(page, []);

    await expect(
      page.getByText("Keine Drittanbieter-Verbindung eingerichtet"),
    ).toBeVisible();
    await expect(page.getByText("Mit Google verbinden")).toBeVisible();
  });

  test("connected state shows connection card", async ({
    authenticatedPage: page,
  }) => {
    const conn = buildEmailConnection({
      email_address: "beamter@bundesamt.de",
      is_active: true,
      // last_sync_at must be set for "Verbunden" status badge
      last_sync_at: new Date().toISOString(),
    });
    await setupEmailPanel(page, [conn]);

    await expect(page.getByText("beamter@bundesamt.de")).toBeVisible();
    await expect(page.getByText("Verbunden")).toBeVisible();
    await expect(page.getByText("Jetzt synchronisieren")).toBeVisible();
    await expect(page.getByText("Verbindung trennen")).toBeVisible();
  });

  test("sync trigger sends POST", async ({ authenticatedPage: page }) => {
    const conn = buildEmailConnection({
      connection_id: "conn-sync-test",
      email_address: "sync@bundesamt.de",
      is_active: true,
    });
    await setupEmailPanel(page, [conn]);

    const syncPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/email/connections/") &&
        req.url().includes("/sync") &&
        req.method() === "POST",
    );
    await page.getByText("Jetzt synchronisieren").click();
    const syncReq = await syncPromise;
    expect(syncReq.url()).toContain("conn-sync-test");
  });

  test("calendar toggle fetches calendar list", async ({
    authenticatedPage: page,
  }) => {
    const conn = buildEmailConnection({
      connection_id: "conn-cal-test",
      email_address: "kalender@bundesamt.de",
      is_active: true,
      calendar_sync_enabled: false,
    });
    const calendars = {
      "conn-cal-test": [
        buildCalendar({
          calendar_id: "cal-1",
          summary: "Dienstkalender",
          primary: true,
        }),
        buildCalendar({ calendar_id: "cal-2", summary: "Urlaub" }),
      ],
    };
    await setupEmailPanel(page, [conn], calendars);

    // Enable calendar sync
    await page.getByLabel("Enable calendar sync").click();

    // Calendar names should appear
    await expect(page.getByText("Dienstkalender")).toBeVisible();
    await expect(page.getByText("Urlaub")).toBeVisible();
  });

  test.skip("reconnect button fetches OAuth URL with login_hint", async ({
    authenticatedPage: page,
  }) => {
    // Skipped: "Neu verbinden" button UI not yet implemented.
    const conn = buildEmailConnection({
      connection_id: "conn-reconnect-test",
      email_address: "reconnect@bundesamt.de",
      is_active: true,
      last_sync_at: new Date().toISOString(),
      calendar_sync_enabled: true,
      last_calendar_sync_error:
        "Google Calendar permission missing. Disconnect and reconnect Google to grant calendar access.",
    });
    await setupEmailPanel(page, [conn]);

    const reconnectBtn = page.getByRole("button", { name: /neu verbinden/i });
    await expect(reconnectBtn).toBeVisible();

    const authorizePromise = page.waitForRequest(
      (req) =>
        req.url().includes("/email/oauth/gmail/authorize") &&
        req.method() === "GET" &&
        !req.url().includes("redirect=true"),
    );

    await reconnectBtn.click();
    const authorizeReq = await authorizePromise;

    const url = new URL(authorizeReq.url());
    expect(url.searchParams.get("login_hint")).toBe("reconnect@bundesamt.de");
    expect(url.searchParams.get("return_url")).toBeTruthy();
  });

  test("popup OAuth connect refreshes data and stays on settings/sync", async ({
    authenticatedPage: page,
  }) => {
    // Dynamic connection list — starts empty, updated after "OAuth"
    let connections: EmailConnectionResponse[] = [];
    const connAfterOAuth = buildEmailConnection({
      email_address: "new@bundesamt.de",
      is_active: true,
      last_sync_at: new Date().toISOString(),
    });

    const ctx = page.context();
    const agentSettings = buildAgentSettings();

    // Context-level routes so both parent AND popup get mocked responses.
    // Page-level routes (from mockItemsSync etc.) only apply to the parent,
    // but the popup needs mocks too so it can boot the React app.
    await ctx.route("**/items/sync*", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildSyncResponse()),
      }),
    );
    await ctx.route("**/orgs", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      }),
    );
    await ctx.route("**/agent/settings", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(agentSettings),
      }),
    );
    await ctx.route("**/agent/status", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "stopped", error: null }),
      }),
    );
    await ctx.route("**/agent/container/stop", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      }),
    );
    await ctx.route("**/agent/container/restart", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      }),
    );

    // Dynamic email connections — returns whatever `connections` currently holds
    await ctx.route("**/email/connections", (route: Route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(connections),
        });
      }
      return route.continue();
    });

    // Popup authorize flow: redirect=true opens in the popup window.
    // Instead of loading the full React app in the popup, serve a minimal
    // HTML page that replicates what the real app does:
    // 1. Set localStorage signal (triggers storage event on parent)
    // 2. Post message to opener (triggers message event on parent)
    // 3. Close the window
    await ctx.route("**/email/oauth/gmail/authorize*", (route: Route) => {
      const url = route.request().url();
      if (url.includes("redirect=true")) {
        const origin = new URL(url).origin;
        return route.fulfill({
          status: 200,
          contentType: "text/html",
          body: [
            "<html><body><script>",
            `var ts = String(Date.now());`,
            `try { localStorage.setItem("gmail-connected", ts); } catch(e) {}`,
            `try {`,
            `  if (window.opener && !window.opener.closed) {`,
            `    window.opener.postMessage({type:"gmail-connected",connectedAt:ts}, "${origin}");`,
            `  }`,
            `} catch(e) {}`,
            `window.close();`,
            "</script></body></html>",
          ].join("\n"),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "https://accounts.google.com/o/oauth2/v2/auth?mock=true",
        }),
      });
    });

    // Reload so parent page uses the context-level mocks
    const syncResponse = page.waitForResponse((r) =>
      r.url().includes("/items/sync"),
    );
    await page.reload();
    await syncResponse;

    // Dismiss the dev/demo disclaimer if it appears
    const disclaimerBtn = page.getByRole("button", {
      name: "I understand",
    });
    if (await disclaimerBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await disclaimerBtn.click();
    }

    const settings = new SettingsPage(page);
    await settings.openSettings();
    await settings.navigateToTab("sync");

    // Verify empty state
    await expect(
      page.getByText("Keine Drittanbieter-Verbindung eingerichtet"),
    ).toBeVisible();

    // Click "Mit Google verbinden" — popup opens
    const popupPromise = page.waitForEvent("popup");
    await page.getByText("Mit Google verbinden").click();
    const popup = await popupPromise;

    // After "OAuth completes", serve the new connection on parent's next refetch
    connections = [connAfterOAuth];

    // Wait for popup to close (popup's ?gmail=connected handler calls window.close())
    await popup.waitForEvent("close", { timeout: 30_000 });

    // ASSERT 1: Parent stays on settings/sync (not inbox)
    await expect(page).toHaveURL(/\/settings\/sync/);

    // ASSERT 2: New connection card appears (data was refetched)
    await expect(page.getByText("new@bundesamt.de")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("disconnect removes connection", async ({ authenticatedPage: page }) => {
    const conn = buildEmailConnection({
      connection_id: "conn-disc-test",
      email_address: "trennung@bundesamt.de",
      is_active: true,
    });
    await setupEmailPanel(page, [conn]);

    const deletePromise = page.waitForRequest(
      (req) =>
        req.url().includes("/email/connections/") && req.method() === "DELETE",
    );
    await page.getByText("Verbindung trennen").click();
    await deletePromise;

    // Should return to empty state
    await expect(
      page.getByText("Keine Drittanbieter-Verbindung eingerichtet"),
    ).toBeVisible();
  });
});
