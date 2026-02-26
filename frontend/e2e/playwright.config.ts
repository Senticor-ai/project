import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  globalSetup: "./global-setup.ts",
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "on-failure" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://project.localhost:5173",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    video: process.env.RECORD_VIDEO ? "on" : undefined,
    // Block service workers so page.route() can intercept all requests.
    // Without this, the PWA caches /api/items/sync and mocked routes are bypassed.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
      testMatch: "**/touch-targets.spec.ts",
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [
        "**/copilot-chat-llm.spec.ts",
        "**/cv-enhancement-llm.spec.ts",
        "**/tax-prep-journey.spec.ts",
        "**/real-user-journey.spec.ts",
      ],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: [
        "**/copilot-chat-llm.spec.ts",
        "**/cv-enhancement-llm.spec.ts",
        "**/tax-prep-journey.spec.ts",
        "**/real-user-journey.spec.ts",
      ],
    },
    {
      name: "llm",
      testMatch: "**/copilot-chat-llm.spec.ts",
      use: { ...devices["Desktop Chrome"], actionTimeout: 60_000 },
    },
    {
      name: "journey",
      testMatch: "**/tax-prep-journey.spec.ts",
      use: { ...devices["Desktop Chrome"], actionTimeout: 15_000 },
    },
    {
      name: "cv-enhancement",
      testMatch: "**/cv-enhancement-llm.spec.ts",
      retries: 0,
      use: {
        ...devices["Desktop Chrome"],
        actionTimeout: 60_000,
        trace: "on",
        video: "on",
      },
    },
    {
      name: "smoke",
      testMatch: "**/real-user-journey.spec.ts",
      retries: 0,
      use: {
        ...devices["Desktop Chrome"],
        actionTimeout: 30_000,
        trace: "on",
        video: "on",
      },
    },
  ],
});
