import type { StorybookConfig } from "@storybook/react-vite";
import remarkGfm from "remark-gfm";

const projectPrefix = process.env.PROJECT_PREFIX?.trim() || "project";
const projectHost = `${projectPrefix}.localhost`;

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
    `${head}<link rel="icon" type="image/svg+xml" href="./storybook-favicon.svg" />`,
  viteFinal: (config) => {
    // Storybook runs alongside the app Vite server in dev-stack.
    // Use a separate cache dir to prevent optimize-deps cache collisions.
    config.cacheDir = "node_modules/.vite/storybook";

    // Force a fresh prebundle per Storybook start to avoid stale optimized
    // dependency references ("Outdated Optimize Dep" 504s).
    const optimizeDeps = config.optimizeDeps ?? {};
    const include = Array.isArray(optimizeDeps.include)
      ? [...optimizeDeps.include]
      : [];
    for (const dep of ["storybook/internal/components"]) {
      if (!include.includes(dep)) {
        include.push(dep);
      }
    }
    config.optimizeDeps = {
      ...optimizeDeps,
      include,
      force: true,
    };

    const server = config.server ?? {};
    const allowedHosts = Array.isArray(server.allowedHosts)
      ? [...server.allowedHosts]
      : [];
    for (const host of ["localhost", "127.0.0.1", ".localhost", projectHost]) {
      if (!allowedHosts.includes(host)) {
        allowedHosts.push(host);
      }
    }
    config.server = {
      ...server,
      host: server.host ?? projectHost,
      allowedHosts,
    };

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
