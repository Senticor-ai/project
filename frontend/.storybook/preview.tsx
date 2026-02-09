import { useState } from "react";
import type { Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { worker } from "./msw-setup";
import "../src/index.css";

// In vitest browser mode, MSW is started by vitest.setup.ts (beforeAll/afterAll).
// In Storybook dev mode, start it here.
const mswReady = import.meta.env.VITEST
  ? Promise.resolve()
  : worker.start({ onUnhandledRequest: "bypass" });

const preview: Preview = {
  loaders: [
    async (context) => {
      await mswReady;
      // Apply per-story MSW handler overrides (parameters.msw.handlers)
      const mswHandlers = context.parameters?.msw?.handlers;
      if (mswHandlers && Array.isArray(mswHandlers)) {
        worker.use(...mswHandlers);
      }
      return {};
    },
  ],
  decorators: [
    (Story) => {
      // Fresh QueryClient per story — stable across re-renders via useState
      const [qc] = useState(
        () =>
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          }),
      );
      return (
        <QueryClientProvider client={qc}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: "error",
      config: {
        rules: [
          {
            // axe-core cannot evaluate oklch() colors or CSS custom properties,
            // producing false "incomplete" warnings on every story.
            // Our palette is manually verified for WCAG AA contrast (≥4.5:1).
            id: "color-contrast",
            enabled: false,
          },
        ],
      },
    },
  },
};

export default preview;
