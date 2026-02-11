import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, vi } from "vitest";

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
