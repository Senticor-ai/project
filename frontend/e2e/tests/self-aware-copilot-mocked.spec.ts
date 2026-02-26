import { test, expect } from "../fixtures/auth.fixture";
import { WorkspacePage } from "../pages/workspace.page";
import {
  mockItemsSync,
  mockOrgsApi,
  mockAgentApi,
  buildItemRecord,
  buildAgentSettings,
  resetMockCounter,
  reloadWithMocks,
} from "../helpers/mock-api";

/**
 * Mocked integration tests for the Self-Aware Copilot context pipeline.
 *
 * Verifies that when a user sends a chat message, the frontend collects
 * workspace state (visible items, active bucket, bucket navigation) and
 * sends it as `context` in the POST to `/chat/completions`.
 *
 * Only the LLM inference endpoint is mocked — all other APIs (items/sync,
 * agent settings, orgs) are mocked to provide a deterministic workspace.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupWorkspaceWithItems(
  page: import("@playwright/test").Page,
  items: ReturnType<typeof buildItemRecord>[] = [],
) {
  await mockItemsSync(page, items);
  await mockOrgsApi(page, []);
  await mockAgentApi(page, buildAgentSettings());
  await reloadWithMocks(page);
}

/** Minimal canned NDJSON response so the chat UI completes cleanly. */
function buildCannedChatResponse(text = "Verstanden.") {
  const events = [
    JSON.stringify({ type: "text_delta", content: text }),
    JSON.stringify({ type: "done", text }),
  ];
  return events.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Self-Aware Copilot — Context Pipeline (mocked)", () => {
  test.beforeEach(() => {
    resetMockCounter();
  });

  test("context includes visible items and bucket nav when chatting from Next", async ({
    authenticatedPage: page,
  }) => {
    // 1. Create 3 mock items in the "next" bucket
    const items = [
      buildItemRecord({ bucket: "next", name: "Steuerbescheid prüfen" }),
      buildItemRecord({ bucket: "next", name: "Antrag vorbereiten" }),
      buildItemRecord({
        bucket: "next",
        name: "Bericht schreiben",
        isFocused: true,
      }),
    ];
    await setupWorkspaceWithItems(page, items);

    // 2. Navigate to Next bucket
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next");

    // 3. Verify items are visible (precondition for context collection)
    await expect(page.getByText("Steuerbescheid prüfen")).toBeVisible();
    await expect(page.getByText("Antrag vorbereiten")).toBeVisible();
    await expect(page.getByText("Bericht schreiben")).toBeVisible();

    // 4. Set up chat completions route
    await page.route("**/chat/completions", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: buildCannedChatResponse("Ich sehe deine Aufgaben."),
      }),
    );

    // 5. Open chat panel (label is "OpenClaw Chat" when openclaw is the default backend)
    await page.getByRole("button", { name: /Chat mit Copilot/ }).click();
    await expect(
      page.getByRole("complementary", { name: "OpenClaw Chat" }),
    ).toBeVisible();

    // 6. Send a message and capture the POST request
    const chatPostPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/chat/completions") && req.method() === "POST",
    );

    const input = page.getByRole("textbox", { name: "Nachricht an OpenClaw" });
    await input.fill("Was sind meine nächsten Aufgaben?");
    await input.press("Enter");

    const chatPost = await chatPostPromise;
    const body = chatPost.postDataJSON();

    // 7. Assert top-level context fields
    expect(body.context).toBeDefined();
    expect(body.context.appView).toBe("workspace");
    expect(body.context.activeBucket).toBe("next");

    // 8. Assert visible workspace snapshot
    const snapshot = body.context.visibleWorkspaceSnapshot;
    expect(snapshot).toBeDefined();
    expect(snapshot.activeBucket).toBe("next");
    expect(snapshot.totalVisibleItems).toBeGreaterThanOrEqual(3);

    // 9. Assert visible items contain our mocked items by name
    const itemNames = snapshot.visibleItems.map(
      (i: { name: string }) => i.name,
    );
    expect(itemNames).toContain("Steuerbescheid prüfen");
    expect(itemNames).toContain("Antrag vorbereiten");
    expect(itemNames).toContain("Bericht schreiben");

    // 10. Assert item metadata (focused flag, type, bucket)
    const focusedItem = snapshot.visibleItems.find(
      (i: { name: string }) => i.name === "Bericht schreiben",
    );
    expect(focusedItem).toBeDefined();
    expect(focusedItem.bucket).toBe("next");
    expect(focusedItem.type).toBe("action");
    expect(focusedItem.focused).toBe(true);

    // 11. Assert bucket nav is present with correct active state
    expect(snapshot.bucketNav).toBeDefined();
    expect(snapshot.bucketNav.length).toBeGreaterThan(0);

    const nextNav = snapshot.bucketNav.find(
      (b: { bucket: string }) => b.bucket === "next",
    );
    expect(nextNav).toBeDefined();
    expect(nextNav.active).toBe(true);
    expect(nextNav.count).toBe(3);

    // 12. Verify the canned response rendered (chat flow completed cleanly)
    await expect(page.getByText("Ich sehe deine Aufgaben.")).toBeVisible();
  });

  test("context adapts when navigating between buckets", async ({
    authenticatedPage: page,
  }) => {
    // 1. Create items across two buckets
    const items = [
      buildItemRecord({ bucket: "inbox", name: "Neuer Eingang" }),
      buildItemRecord({ bucket: "next", name: "Nächste Aufgabe" }),
    ];
    await setupWorkspaceWithItems(page, items);

    // 2. Set up chat completions route
    await page.route("**/chat/completions", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: buildCannedChatResponse(),
      }),
    );

    // 3. Default landing is Inbox — open chat and send message
    await page.getByRole("button", { name: /Chat mit Copilot/ }).click();
    await expect(
      page.getByRole("complementary", { name: "OpenClaw Chat" }),
    ).toBeVisible();

    const inboxPostPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/chat/completions") && req.method() === "POST",
    );

    const input = page.getByRole("textbox", { name: "Nachricht an OpenClaw" });
    await input.fill("Was liegt im Eingang?");
    await input.press("Enter");

    const inboxPost = await inboxPostPromise;
    const inboxBody = inboxPost.postDataJSON();
    expect(inboxBody.context.activeBucket).toBe("inbox");
    expect(inboxBody.context.appView).toBe("workspace");

    // 4. Wait for response to complete
    await expect(page.getByText("Verstanden.")).toBeVisible();

    // 5. Navigate to Next bucket (chat stays open)
    const ws = new WorkspacePage(page);
    await ws.navigateTo("Next");
    await expect(page.getByText("Nächste Aufgabe")).toBeVisible();

    // 6. Send another message — context should now reflect "next"
    const nextPostPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/chat/completions") && req.method() === "POST",
    );

    await input.fill("Was steht als Nächstes an?");
    await input.press("Enter");

    const nextPost = await nextPostPromise;
    const nextBody = nextPost.postDataJSON();
    expect(nextBody.context.activeBucket).toBe("next");
    expect(nextBody.context.visibleWorkspaceSnapshot.activeBucket).toBe("next");

    // The "next" bucket item should be in visible items
    const nextItemNames =
      nextBody.context.visibleWorkspaceSnapshot.visibleItems.map(
        (i: { name: string }) => i.name,
      );
    expect(nextItemNames).toContain("Nächste Aufgabe");
  });
});
