import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "on-failure" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    video: process.env.RECORD_VIDEO ? "on" : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [
        "**/tay-chat-llm.spec.ts",
        "**/tax-prep-journey.spec.ts",
        "**/real-user-journey.spec.ts",
      ],
    },
    {
      name: "llm",
      testMatch: "**/tay-chat-llm.spec.ts",
      use: { ...devices["Desktop Chrome"], actionTimeout: 60_000 },
    },
    {
      name: "journey",
      testMatch: "**/tax-prep-journey.spec.ts",
      use: { ...devices["Desktop Chrome"], actionTimeout: 15_000 },
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
