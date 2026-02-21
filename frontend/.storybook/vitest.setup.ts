import { afterAll, afterEach, beforeAll } from "vitest";
import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
import { setProjectAnnotations } from "@storybook/react-vite";
import * as projectAnnotations from "./preview";
import { worker } from "./msw-setup";

// Apply Storybook project annotations for portable stories in Vitest.
setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

// MSW lifecycle for Storybook tests in browser mode.
beforeAll(async () => {
  await worker.start({ onUnhandledRequest: "error" });
});

afterEach(() => {
  worker.resetHandlers();
});

afterAll(() => {
  worker.stop();
});
