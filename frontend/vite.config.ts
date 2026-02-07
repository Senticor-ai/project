/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

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
        target: "http://localhost:8000",
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
        "src/test/**",
        "src/**/*.d.ts",
        "src/generated/**",
        "src/docs/**",
        "src/vite-env.d.ts",
      ],
      all: true,
      reporter: ["text", "html", "json"],
      reportsDirectory: "./coverage",
    },
    projects: [
      // Unit tests (jsdom, fast)
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/test/setup.ts"],
        },
      },
      // Storybook interaction tests (browser, slower)
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
          }),
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
      },
    ],
  },
});
