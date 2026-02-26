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
 * Mocked integration tests for file preview/download links on ReferenceRow.
 * Tests that view and download links render with correct href attributes
 * based on the file's encoding format.
 */

async function setupReferenceBucket(
  page: import("@playwright/test").Page,
  items: ReturnType<typeof buildItemRecord>[],
) {
  await mockItemsSync(page, items);
  await mockOrgsApi(page, []);
  await mockAgentApi(page, buildAgentSettings());
  await reloadWithMocks(page);

  // Navigate to Reference bucket
  const ws = new WorkspacePage(page);
  await ws.navigateTo("Reference");
}

test.describe("File Preview / Download (mocked)", () => {
  test.beforeEach(() => {
    resetMockCounter();
  });

  test("PDF shows view and download links", async ({
    authenticatedPage: page,
  }) => {
    const pdf = buildItemRecord({
      bucket: "reference",
      type: "DigitalDocument",
      name: "Bescheid.pdf",
      encodingFormat: "application/pdf",
      fileId: "file-pdf-1",
      downloadUrl: "/files/file-pdf-1/download",
    });
    await setupReferenceBucket(page, [pdf]);

    await expect(page.getByText("Bescheid.pdf")).toBeVisible();

    // View link (inline=true for browser preview)
    const viewLink = page.getByLabel("View file");
    await expect(viewLink).toBeVisible();
    await expect(viewLink).toHaveAttribute("href", /inline=true/);

    // Download link
    const downloadLink = page.getByLabel("Download file");
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute("download", /.*/);
  });

  test("non-viewable format shows download only", async ({
    authenticatedPage: page,
  }) => {
    const zip = buildItemRecord({
      bucket: "reference",
      type: "DigitalDocument",
      name: "Archiv.zip",
      encodingFormat: "application/zip",
      fileId: "file-zip-1",
      downloadUrl: "/files/file-zip-1/download",
    });
    await setupReferenceBucket(page, [zip]);

    await expect(page.getByText("Archiv.zip")).toBeVisible();

    // No view link for non-viewable format
    await expect(page.getByLabel("View file")).not.toBeVisible();

    // Download link present
    const downloadLink = page.getByLabel("Download file");
    await expect(downloadLink).toBeVisible();
  });

  test("image format shows view link", async ({ authenticatedPage: page }) => {
    const image = buildItemRecord({
      bucket: "reference",
      type: "DigitalDocument",
      name: "Foto.png",
      encodingFormat: "image/png",
      fileId: "file-img-1",
      downloadUrl: "/files/file-img-1/download",
    });
    await setupReferenceBucket(page, [image]);

    await expect(page.getByText("Foto.png")).toBeVisible();

    // View link present for images
    const viewLink = page.getByLabel("View file");
    await expect(viewLink).toBeVisible();
    await expect(viewLink).toHaveAttribute("href", /inline=true/);
  });
});
