import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppBootstrap } from "./AppBootstrap";

vi.mock("@/App", () => ({
  default: () => <div data-testid="app-content">App</div>,
}));

vi.mock("@/lib/auth-context", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/ToastProvider", () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/shell/PwaUpdateNotifier", () => ({
  PwaUpdateNotifier: () => null,
}));

vi.mock("@tanstack/react-query-persist-client", () => ({
  PersistQueryClientProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@tanstack/react-query-devtools", () => ({
  ReactQueryDevtools: () => null,
}));

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
const originalMatchMedia = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia",
);
const originalRaf = Object.getOwnPropertyDescriptor(
  window,
  "requestAnimationFrame",
);
const originalCancelRaf = Object.getOwnPropertyDescriptor(
  window,
  "cancelAnimationFrame",
);

function restoreDescriptor(
  target: object,
  key: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }
  Reflect.deleteProperty(target, key);
}

function setDocumentFonts(load: ((font: string) => Promise<unknown>) | null) {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: load ? { load } : undefined,
  });
}

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } satisfies MediaQueryList),
  });
}

function addStartupSplash() {
  const splash = document.createElement("div");
  splash.id = "startup-splash";
  document.body.appendChild(splash);
  return splash;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AppBootstrap", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.getElementById("startup-splash")?.remove();
  });

  afterEach(() => {
    restoreDescriptor(document, "fonts", originalFonts);
    restoreDescriptor(window, "matchMedia", originalMatchMedia);
    restoreDescriptor(window, "requestAnimationFrame", originalRaf);
    restoreDescriptor(window, "cancelAnimationFrame", originalCancelRaf);
    document.getElementById("startup-splash")?.remove();
  });

  it("renders immediately when Font Loading API is unavailable", async () => {
    setDocumentFonts(null);
    setReducedMotion(false);
    const splash = addStartupSplash();

    render(<AppBootstrap />);

    expect(screen.getByTestId("app-content")).toBeInTheDocument();
    await waitFor(() =>
      expect(splash.getAttribute("data-hidden")).toBe("true"),
    );
  });

  it("waits for fonts and fades in before final ready state", async () => {
    const ready = deferred<unknown>();
    const load = vi.fn(() => ready.promise);
    setDocumentFonts(load);
    setReducedMotion(false);
    const splash = addStartupSplash();

    let rafCallback: FrameRequestCallback | undefined;
    let rafCalls = 0;
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        rafCalls += 1;
        if (rafCalls === 1) {
          cb(0);
          return rafCalls;
        }
        rafCallback = cb;
        return rafCalls;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const { container } = render(<AppBootstrap />);
    expect(screen.queryByTestId("app-content")).not.toBeInTheDocument();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load).toHaveBeenCalledWith('1em "Material Symbols Outlined"');
    expect(load).toHaveBeenCalledWith('1em "Inter"');

    ready.resolve(null);

    const content = await screen.findByTestId("app-content");
    const shell = content.parentElement as HTMLElement;
    expect(shell.style.opacity).toBe("0");
    expect(raf).toHaveBeenCalledTimes(2);
    expect(container.firstElementChild).toBe(shell);

    await waitFor(() => {
      rafCallback?.(0);
      expect(shell.style.opacity).toBe("1");
    });
    await waitFor(() =>
      expect(splash.getAttribute("data-hidden")).toBe("true"),
    );
  });

  it("skips fade scheduling when reduced motion is preferred", async () => {
    const load = vi.fn(() => Promise.resolve([]));
    setDocumentFonts(load);
    setReducedMotion(true);

    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(<AppBootstrap />);

    expect(await screen.findByTestId("app-content")).toBeInTheDocument();
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it("falls back to timeout when requestAnimationFrame is unavailable", async () => {
    const load = vi.fn(() => Promise.resolve([]));
    setDocumentFonts(load);
    setReducedMotion(false);
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: undefined,
    });

    render(<AppBootstrap />);

    const content = await screen.findByTestId("app-content");
    await waitFor(() =>
      expect((content.parentElement as HTMLElement).style.opacity).toBe("1"),
    );
  });
});
