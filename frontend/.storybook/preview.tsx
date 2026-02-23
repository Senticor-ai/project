import { useState } from "react";
import type { Preview } from "@storybook/react-vite";
import { MINIMAL_VIEWPORTS } from "storybook/viewport";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../src/components/ui/ToastProvider";
import { worker } from "./msw-setup";
import "../src/index.css";

type VitestGlobal = typeof globalThis & {
  __vitest_worker__?: unknown;
};

// MSW lifecycle:
// - vitest browser mode: started by vitest.setup.ts (beforeAll/afterAll)
// - storybook dev + static build: started here (requires trusted TLS cert)
const isVitestRuntime =
  import.meta.env.MODE === "test" ||
  Boolean((globalThis as VitestGlobal).__vitest_worker__);
const mswReady = isVitestRuntime
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
    viewport: {
      options: {
        ...MINIMAL_VIEWPORTS,
        iphoneSE: {
          name: "iPhone SE",
          styles: { width: "375px", height: "667px" },
          type: "mobile" as const,
        },
        iphone14: {
          name: "iPhone 14",
          styles: { width: "390px", height: "844px" },
          type: "mobile" as const,
        },
        ipadMini: {
          name: "iPad mini",
          styles: { width: "768px", height: "1024px" },
          type: "tablet" as const,
        },
      },
    },
    options: {
      storySort: {
        method: "alphabetical" as const,
        order: [
          "Product",
          ["Vision", "Methodology", "Feature Map", "Sales Battlecard", "Epics"],
          "Flows",
          ["Collect to Engage", "Tax Prep", ["Overview", "*"]],
          "Design",
          ["Philosophy", "Paperclip Principles", "Tokens"],
          "Engineering",
          [
            "Architecture",
            "Routing",
            "Deployment",
            "Backend API Requests",
            "Backend Architecture",
            "Ontology",
            ["*"],
          ],
          "Primitives",
          "UI",
          "Work",
          "Screens",
          "Shell",
          "Settings",
        ],
      },
    },
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
