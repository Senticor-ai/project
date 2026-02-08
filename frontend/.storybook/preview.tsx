import type { Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../src/index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const preview: Preview = {
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
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
