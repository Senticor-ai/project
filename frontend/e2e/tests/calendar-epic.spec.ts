import { test, expect } from "../fixtures/auth.fixture";
import type { Page } from "@playwright/test";
import { WorkspacePage } from "../pages/workspace.page";
import { DisclaimerPage } from "../pages/disclaimer.page";

async function acknowledgeDisclaimerIfVisible(page: Page) {
  const disclaimer = new DisclaimerPage(page);
  const modalAlreadyVisible = await disclaimer.modal.isVisible();
  if (!modalAlreadyVisible) {
    const appeared = await disclaimer.modal
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      return;
    }
  }
  await disclaimer.acknowledge();
  await expect(disclaimer.modal).not.toBeVisible();
}

test.describe("Calendar Epic E2E", () => {
  test("calendar bucket supports mode switching and event write actions", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const ws = new WorkspacePage(page);
    await acknowledgeDisclaimerIfVisible(page);

    const eventName = `Epic calendar event ${Date.now()}`;
    await apiSeed.createCalendarEvent(eventName, {
      description: "Calendar E2E integration event",
    });
    await ws.navigateTo("Calendar");

    await expect(page.getByRole("button", { name: "list" })).toBeVisible();
    await expect(page.getByRole("button", { name: "week" })).toBeVisible();
    await expect(page.getByRole("button", { name: "month" })).toBeVisible();

    await page.getByRole("button", { name: "week" }).click();
    await expect(page.getByText(eventName)).toBeVisible();
    await page.getByRole("button", { name: "month" }).click();
    await expect(page.getByText(eventName)).toBeVisible();
    await page.getByRole("button", { name: "list" }).click();

    await expect(page.getByText(eventName)).toBeVisible();
    await page.getByText(eventName).first().click();
    await expect(page.getByText("Event details")).toBeVisible();

    const patchResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/calendar/events/") &&
        response.request().method() === "PATCH" &&
        response.status() === 200,
    );
    await page.getByRole("button", { name: "Save" }).click();
    await patchResponse;
  });

  test("urgent proposal notification opens Copilot and injects review prompt", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const proposalId = `proposal-e2e-${Date.now()}`;
    await acknowledgeDisclaimerIfVisible(page);

    await expect(
      page.getByRole("complementary", { name: "Copilot Chat" }),
    ).not.toBeVisible();

    await apiSeed.sendNotification({
      kind: "proposal_urgent_created",
      title: "Urgent meeting reschedule request",
      body: "Please review a 30-minute move request.",
      url: `/workspace/calendar?proposal=${proposalId}`,
      payload: {
        proposal_id: proposalId,
        proposal_type: "Proposal.RescheduleMeeting",
        urgency: "urgent",
      },
    });

    await expect(
      page.getByRole("complementary", { name: "Copilot Chat" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(proposalId)).toBeVisible({ timeout: 15_000 });
  });

  test("event detail panel shows sync state badge", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const ws = new WorkspacePage(page);
    await acknowledgeDisclaimerIfVisible(page);

    const eventName = `Sync badge event ${Date.now()}`;
    await apiSeed.createCalendarEvent(eventName);
    await ws.navigateTo("Calendar");

    await expect(page.getByText(eventName)).toBeVisible();
    await page.getByText(eventName).first().click();
    await expect(page.getByText("Event details")).toBeVisible();

    // Local-only events created via apiSeed show "Local only" badge
    await expect(page.getByText("Local only")).toBeVisible();
  });

  test("inbox triage to calendar creates Event type and shows in calendar", async ({
    authenticatedPage: page,
    apiSeed,
  }) => {
    const ws = new WorkspacePage(page);
    await acknowledgeDisclaimerIfVisible(page);

    const itemTitle = `Triage to cal ${Date.now()}`;
    await apiSeed.createInboxItem(itemTitle);
    await page.reload();
    await page.waitForSelector('nav[aria-label="Buckets"]', {
      timeout: 10_000,
    });

    await expect(page.getByText(itemTitle)).toBeVisible();

    // Triage to Calendar — triggers date picker
    await ws.triageButton("Calendar").click();
    await page.getByLabel("Schedule date").fill("2026-04-15");

    // Item should leave inbox
    await expect(page.getByText(itemTitle)).not.toBeVisible();

    // Navigate to Calendar and verify item appears
    await ws.navigateTo("Calendar");
    await expect(page.getByText(itemTitle)).toBeVisible();
  });
});
