/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

// Storybook vitest plugins load presets via esbuild at config evaluation
// time, which deadlocks in constrained CI k8s pods.  Only import them for
// local dev or when explicitly opted-in via STORYBOOK_TESTS=1.
const storybookProject =
  process.env.CI && !process.env.STORYBOOK_TESTS
    ? null
    : await (async () => {
        const { storybookTest } =
          await import("@storybook/addon-vitest/vitest-plugin");
        const { playwright } = await import("@vitest/browser-playwright");
        return {
          extends: true as const,
          plugins: [
            storybookTest({ configDir: path.join(dirname, ".storybook") }),
          ],
          test: {
            name: "storybook",
            browser: {
              enabled: true,
              headless: true,
              provider: playwright({}),
              instances: [{ browser: "chromium" }],
            },
            setupFiles: [".storybook/vitest.setup.ts"],
          },
        };
      })();

export default defineConfig({
  envDir: path.resolve(dirname, ".."),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  optimizeDeps: {
    entries: ["index.html", "src/**/*.{ts,tsx}"],
  },
  server: {
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.VITE_BACKEND_PORT ?? "8000"}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.stories.{ts,tsx}",
        "src/**/*.test.{ts,tsx}",
        "src/**/__tests__/**",
        "src/test/**",
        "src/**/*.d.ts",
        "src/generated/**",
        "src/docs/**",
        "src/vite-env.d.ts",
        "src/main.tsx",
      ],
      all: false,
      reporter: ["text", "html", "json"],
      reportsDirectory: "./coverage",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/test/setup.ts"],
        },
      },
      ...(storybookProject ? [storybookProject] : []),
    ],
  },
});
