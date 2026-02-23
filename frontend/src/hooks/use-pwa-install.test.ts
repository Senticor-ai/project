import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePwaInstall } from "./use-pwa-install";

describe("usePwaInstall", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns canInstall=false when no beforeinstallprompt fires", () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canInstall).toBe(false);
  });

  it("sets canInstall=true when beforeinstallprompt fires", () => {
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      const event = new Event("beforeinstallprompt");
      Object.assign(event, {
        prompt: vi.fn(),
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(event);
    });

    expect(result.current.canInstall).toBe(true);
  });

  it("promptInstall calls prompt() and returns true on accepted", async () => {
    const promptFn = vi.fn();
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      const event = new Event("beforeinstallprompt");
      Object.assign(event, {
        prompt: promptFn,
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(event);
    });

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(promptFn).toHaveBeenCalledOnce();
    expect(accepted).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  it("promptInstall returns false on dismissed", async () => {
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      const event = new Event("beforeinstallprompt");
      Object.assign(event, {
        prompt: vi.fn(),
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(event);
    });

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(accepted).toBe(false);
  });

  it("promptInstall returns false when no deferred prompt", async () => {
    const { result } = renderHook(() => usePwaInstall());

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(accepted).toBe(false);
  });

  it("cleans up event listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => usePwaInstall());

    expect(addSpy).toHaveBeenCalledWith(
      "beforeinstallprompt",
      expect.any(Function),
    );

    unmount();

    expect(removeSpy).toHaveBeenCalledWith(
      "beforeinstallprompt",
      expect.any(Function),
    );
  });
});
