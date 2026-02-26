import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";
import {
  mockItemsSync,
  mockOrgsApi,
  mockAgentApi,
  mockItemContent,
  mockItemMutations,
  buildItemRecord,
  buildAgentSettings,
  resetMockCounter,
  reloadWithMocks,
} from "../helpers/mock-api";

/**
 * Mocked integration tests for OrgDoc editing (general, user, log, agent types).
 * Items are mocked via items/sync; content endpoints are intercepted.
 */

async function setupReferenceBucket(
  page: import("@playwright/test").Page,
  items: ReturnType<typeof buildItemRecord>[],
  contentMap: Record<string, string> = {},
) {
  // Register specific patterns before general ones (LIFO ordering)
  await mockItemMutations(page);
  await mockItemContent(page, contentMap);
  await mockItemsSync(page, items);
  await mockOrgsApi(page, []);
  await mockAgentApi(page, buildAgentSettings());
  await reloadWithMocks(page);

  // Navigate to Reference bucket
  const ws = new WorkspacePage(page);
  await ws.navigateTo("Reference");
}

test.describe("OrgDoc Editing (mocked)", () => {
  test.beforeEach(() => {
    resetMockCounter();
  });

  test("general doc shows editable textarea", async ({
    authenticatedPage: page,
  }) => {
    const doc = buildItemRecord({
      bucket: "reference",
      name: "Interner Leitfaden",
      orgDocType: "general",
    });
    await setupReferenceBucket(page, [doc], {
      [doc.canonical_id]: "# Leitfaden\n\nDies ist der Inhalt.",
    });

    // Click to expand the OrgDoc
    await page.getByText("Interner Leitfaden").click();

    // Textarea should appear with the document content
    const textarea = page.getByLabel(/Edit Interner Leitfaden/);
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue("# Leitfaden\n\nDies ist der Inhalt.");
  });

  test("edit and blur saves content", async ({ authenticatedPage: page }) => {
    const doc = buildItemRecord({
      bucket: "reference",
      name: "Bearbeitbares Dokument",
      orgDocType: "user",
    });
    await setupReferenceBucket(page, [doc], {
      [doc.canonical_id]: "Alter Inhalt",
    });

    // Expand
    await page.getByText("Bearbeitbares Dokument").click();

    // Edit textarea
    const textarea = page.getByLabel(/Edit Bearbeitbares Dokument/);
    await textarea.clear();
    await textarea.fill("Neuer Inhalt");

    // Blur should trigger PATCH to file-content
    const patchPromise = page.waitForRequest(
      (req) => req.url().includes("/file-content") && req.method() === "PATCH",
    );
    await textarea.blur();
    const patchReq = await patchPromise;
    expect(patchReq.postDataJSON().text).toBe("Neuer Inhalt");
  });

  test("log doc shows append input", async ({ authenticatedPage: page }) => {
    const doc = buildItemRecord({
      bucket: "reference",
      name: "Protokoll",
      orgDocType: "log",
    });
    await setupReferenceBucket(page, [doc], {
      [doc.canonical_id]: "Eintrag 1\nEintrag 2",
    });

    // Expand
    await page.getByText("Protokoll").click();

    // Content should be visible in a read-only pre
    await expect(page.getByText("Eintrag 1")).toBeVisible();
    await expect(page.getByText("Eintrag 2")).toBeVisible();

    // Append input should be visible
    const input = page.getByPlaceholder(/log entry/i);
    await expect(input).toBeVisible();

    // Type and press Enter to append
    const appendPromise = page.waitForRequest(
      (req) => req.url().includes("/append-content") && req.method() === "POST",
    );
    await input.fill("Neuer Eintrag");
    await input.press("Enter");
    const appendReq = await appendPromise;
    expect(appendReq.postDataJSON().text).toBe("Neuer Eintrag");
  });

  test("agent doc is read-only", async ({ authenticatedPage: page }) => {
    const doc = buildItemRecord({
      bucket: "reference",
      name: "Agent-Notizen",
      orgDocType: "agent",
    });
    await setupReferenceBucket(page, [doc], {
      [doc.canonical_id]: "Automatische Zusammenfassung.",
    });

    // Expand
    await page.getByText("Agent-Notizen").click();

    // Content visible but no editable elements
    await expect(page.getByText("Automatische Zusammenfassung.")).toBeVisible();

    // No edit textarea or append input for agent docs
    await expect(page.getByLabel(/Edit Agent-Notizen/)).not.toBeVisible();
    await expect(page.getByPlaceholder(/log entry/i)).not.toBeVisible();
  });
});
