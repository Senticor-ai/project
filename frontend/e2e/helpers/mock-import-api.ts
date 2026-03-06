/**
 * Mock API helpers for Nirvana import flow in Playwright mocked tests.
 *
 * Intercepts all endpoints involved in the file upload + import pipeline:
 * - POST /files/initiate
 * - PUT  /files/upload/:id
 * - POST /files/complete
 * - POST /imports/nirvana/inspect
 * - POST /imports/nirvana/from-file
 * - GET  /imports/jobs/:id
 */
import type { Page, Route } from "@playwright/test";

type MockImportOptions = {
  /** Number of items the inspect endpoint reports. */
  itemCount: number;
  /** If set, /files/initiate returns this status (e.g. 500 for error). */
  initiateStatus?: number;
};

export async function mockNirvanaImportApi(
  page: Page,
  options: MockImportOptions,
): Promise<void> {
  const uploadId = "mock-upload-id";
  const fileId = "mock-file-id";
  const jobId = "mock-job-id";

  // POST /files/initiate
  await page.route("**/files/initiate", (route: Route) => {
    if (options.initiateStatus && options.initiateStatus >= 400) {
      return route.fulfill({
        status: options.initiateStatus,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Storage directory creation failed",
        }),
      });
    }
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        upload_id: uploadId,
        upload_url: `/files/upload/${uploadId}`,
        chunk_size: 5242880,
        chunk_total: 1,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      }),
    });
  });

  // PUT /files/upload/:id
  await page.route("**/files/upload/*", (route: Route) => {
    if (route.request().method() !== "PUT") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ received: 1000, chunk_index: 0 }),
    });
  });

  // POST /files/complete
  await page.route("**/files/complete", (route: Route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        file_id: fileId,
        original_name: "nirvana-small.json",
        content_type: "application/json",
        size_bytes: 1000,
        sha256: "mock-sha256",
        created_at: new Date().toISOString(),
        download_url: `/files/${fileId}`,
      }),
    }),
  );

  // POST /imports/nirvana/inspect
  await page.route("**/imports/nirvana/inspect", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total: options.itemCount,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        bucket_counts: {
          inbox: 1,
          next: 2,
          waiting: 1,
          scheduled: 1,
          someday: 1,
          reference: 0,
        },
        completed_counts: {},
        sample_errors: [],
      }),
    }),
  );

  // POST /imports/nirvana/from-file
  await page.route("**/imports/nirvana/from-file", (route: Route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: jobId,
        status: "queued",
      }),
    }),
  );

  // GET /imports/jobs/:id (returns completed immediately for mocked tests)
  await page.route("**/imports/jobs/*", (route: Route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: jobId,
        status: "completed",
        file_id: fileId,
        file_sha256: "mock-sha256",
        source: "nirvana",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        summary: {
          total: options.itemCount,
          created: options.itemCount,
          updated: 0,
          skipped: 0,
          errors: 0,
          bucket_counts: {
            inbox: 1,
            next: 2,
            waiting: 1,
            scheduled: 1,
            someday: 1,
            reference: 0,
          },
          completed_counts: {},
          sample_errors: [],
        },
        progress: null,
        error: null,
        archived_at: null,
      }),
    });
  });
}
