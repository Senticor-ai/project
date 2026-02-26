import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";
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
 * Mocked integration tests for Person management in the Reference bucket.
 * Tests PersonRow rendering, contact links, and archive flow.
 */

async function setupReferenceBucket(
  page: import("@playwright/test").Page,
  items: ReturnType<typeof buildItemRecord>[],
) {
  await mockItemPatch(page);
  await mockItemsSync(page, items);
  await mockOrgsApi(page, []);
  await mockAgentApi(page, buildAgentSettings());
  await reloadWithMocks(page);

  // Navigate to Reference bucket
  const ws = new WorkspacePage(page);
  await ws.navigateTo("Reference");
}

test.describe("Person Management (mocked)", () => {
  test.beforeEach(() => {
    resetMockCounter();
  });

  test("person displays name, role, and org badge", async ({
    authenticatedPage: page,
  }) => {
    const person = buildItemRecord({
      bucket: "reference",
      name: "Dr. Müller",
      orgRole: "founder",
      orgRef: { id: "org-1", name: "Bundesamt für IT" },
    });
    await setupReferenceBucket(page, [person]);

    await expect(page.getByText("Dr. Müller")).toBeVisible();
    await expect(page.getByText("Bundesamt für IT")).toBeVisible();
  });

  test("contact links render correctly", async ({
    authenticatedPage: page,
  }) => {
    const person = buildItemRecord({
      bucket: "reference",
      name: "Frau Schmidt",
      email: "schmidt@bundesamt.de",
      telephone: "+49301234567",
    });
    await setupReferenceBucket(page, [person]);

    // Email link with correct href
    const emailLink = page.getByRole("link", {
      name: /schmidt@bundesamt\.de/,
    });
    await expect(emailLink).toBeVisible();
    await expect(emailLink).toHaveAttribute(
      "href",
      "mailto:schmidt@bundesamt.de",
    );

    // Telephone link with correct href
    const telLink = page.getByRole("link", { name: /\+49301234567/ });
    await expect(telLink).toBeVisible();
    await expect(telLink).toHaveAttribute("href", "tel:+49301234567");
  });

  test("archive via actions menu", async ({ authenticatedPage: page }) => {
    const person = buildItemRecord({
      bucket: "reference",
      name: "Herr Weber",
      orgRole: "member",
    });
    await setupReferenceBucket(page, [person]);

    // Hover over the person row to reveal the actions button
    await page.getByText("Herr Weber").hover();

    // Open actions menu
    await page.getByLabel("Person actions").click();

    // Click archive — archive sends DELETE, set up listener before clicking
    const deletePromise = page.waitForRequest(
      (req) => req.url().includes("/items/") && req.method() === "DELETE",
    );
    await page.getByRole("button", { name: /Archive/i }).click();
    await deletePromise;
  });

  test("multiple persons with different roles", async ({
    authenticatedPage: page,
  }) => {
    const persons = [
      buildItemRecord({
        bucket: "reference",
        name: "Anna Berater",
        orgRole: "advisor",
      }),
      buildItemRecord({
        bucket: "reference",
        name: "Klaus Buchhalter",
        orgRole: "accountant",
      }),
      buildItemRecord({
        bucket: "reference",
        name: "Petra Gründerin",
        orgRole: "founder",
      }),
    ];
    await setupReferenceBucket(page, persons);

    await expect(page.getByText("Anna Berater")).toBeVisible();
    await expect(page.getByText("Klaus Buchhalter")).toBeVisible();
    await expect(page.getByText("Petra Gründerin")).toBeVisible();
  });
});
