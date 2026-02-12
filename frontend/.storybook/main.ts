import type { StorybookConfig } from "@storybook/react-vite";
import remarkGfm from "remark-gfm";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  staticDirs: ["../public"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    {
      name: "@storybook/addon-docs",
      options: {
        mdxPluginOptions: {
          mdxCompileOptions: {
            remarkPlugins: [remarkGfm],
          },
        },
      },
    },
    "@storybook/addon-onboarding",
    "storybook/viewport",
  ],
  framework: "@storybook/react-vite",
  managerHead: (head) =>
    `${head}<link rel="icon" type="image/svg+xml" href="/storybook-favicon.svg" />`,
  viteFinal: (config) => {
    if (process.env.STORYBOOK_BASE) {
      config.base = process.env.STORYBOOK_BASE;
      // Remove the mocker plugin — it injects a script tag with an absolute
      // root path (/vite-inject-mocker-entry.js) that ignores Vite's base
      // config. Only needed for vitest browser testing, not static builds.
      config.plugins = config.plugins
        ?.flat()
        .filter(
          (p) =>
            !(
              p &&
              typeof p === "object" &&
              "name" in p &&
              p.name === "vite:storybook-inject-mocker-runtime"
            ),
        );
    }
    return config;
  },
};
export default config;
