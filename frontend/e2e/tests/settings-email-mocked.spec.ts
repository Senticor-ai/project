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
  reloadWithMocks,
} from "../helpers/mock-api";
import type {
  EmailConnectionResponse,
  EmailCalendarResponse,
} from "../helpers/mock-api";

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
  await settings.navigateToTab("email");
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
