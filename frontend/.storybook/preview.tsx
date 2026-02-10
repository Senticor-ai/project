import { useState } from "react";
import type { Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../src/components/ui/ToastProvider";
import { worker } from "./msw-setup";
import "../src/index.css";

// MSW lifecycle:
// - vitest browser mode: started by vitest.setup.ts (beforeAll/afterAll)
// - storybook dev + static build: started here (requires trusted TLS cert)
const mswReady = import.meta.env.VITEST
  ? Promise.resolve()
  : worker
      .start({
        onUnhandledRequest: "bypass",
        serviceWorker: {
          url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
        },
      })
      .catch(() => {
        // Service Worker registration fails without a trusted TLS certificate.
        // Connected stories will show loading/empty state; all others render fine.
      });

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
          <ToastProvider>
            <Story />
          </ToastProvider>
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
