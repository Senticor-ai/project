import { vi } from "vitest";

const originalMatchMedia = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia",
);

/**
 * Mock `window.matchMedia` so that `useIsMobile()` returns the desired value.
 * Call before `render()`. Pair with `restoreViewport()` in `afterEach`.
 */
export function setMobileViewport(mobile: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: mobile,
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } satisfies MediaQueryList),
  });
}

/** Restore the original `matchMedia` after each test. */
export function restoreViewport(): void {
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", originalMatchMedia);
  }
}
