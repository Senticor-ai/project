/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
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
              instances: [{ browser: "chromium" as const }],
            },
            setupFiles: [".storybook/vitest.setup.ts"],
          },
        };
      })();

export default defineConfig({
  envDir: path.resolve(dirname, ".."),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false, // using our own public/manifest.json
      devOptions: {
        enabled: true,
        type: "module",
        suppressWarnings: true,
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB (icon font is ~4MB)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        globIgnores: ["**/storybook-*"],
        runtimeCaching: [
          {
            urlPattern: /\/api\/items\/sync/,
            handler: "NetworkFirst",
            options: {
              cacheName: "items-sync",
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  optimizeDeps: {
    entries: ["index.html", "src/**/*.{ts,tsx}"],
    // Prevent mid-run dependency optimization reloads in Vitest browser mode.
    include: ["workbox-window"],
  },
  server: {
    fs: {
      allow: [path.resolve(dirname, "..")],
    },
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
      reporter: ["text", "html", "json"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
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
