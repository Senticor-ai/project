import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

// Fail fast on network calls in unit tests — forces proper mocking.
const originalFetch = globalThis.fetch;
globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
  const url =
    typeof args[0] === "string"
      ? args[0]
      : args[0] instanceof URL
        ? args[0].href
        : (args[0]?.url ?? "");
  throw new Error(
    `Unit test made a network call to: ${url}\n` +
      `Mock the dependency or move this test to the storybook project.`,
  );
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = originalFetch;
});

// jsdom doesn't implement matchMedia — stub it for components that use useIsMobile
if (typeof window.matchMedia !== "function") {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Fail tests on React act() warnings — catches state updates outside act()
// that indicate race conditions or missing async handling.
beforeAll(() => {
  const originalError = console.error;
  console.error = (...args: Parameters<typeof console.error>) => {
    const message = typeof args[0] === "string" ? args[0] : String(args[0]);
    if (message.includes("not wrapped in act(")) {
      throw new Error(`act() warning detected: ${message}`);
    }
    originalError.call(console, ...args);
  };
});

afterEach(() => {
  cleanup();
});
