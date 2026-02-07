import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocationState } from "./use-location-state";

beforeEach(() => {
  // Reset to a known URL before each test
  window.history.replaceState({}, "", "/workspace/inbox");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLocationState", () => {
  describe("initial state", () => {
    it("reads workspace/inbox from URL", () => {
      window.history.replaceState({}, "", "/workspace/inbox");
      const { result } = renderHook(() => useLocationState());
      expect(result.current.location).toEqual({
        view: "workspace",
        sub: "inbox",
      });
    });

    it("reads workspace/next from URL", () => {
      window.history.replaceState({}, "", "/workspace/next");
      const { result } = renderHook(() => useLocationState());
      expect(result.current.location).toEqual({
        view: "workspace",
        sub: "next",
      });
    });

    it("reads settings/labels from URL", () => {
      window.history.replaceState({}, "", "/settings/labels");
      const { result } = renderHook(() => useLocationState());
      expect(result.current.location).toEqual({
        view: "settings",
        sub: "labels",
      });
    });

    it("defaults / to workspace/inbox and replaces URL", () => {
      window.history.replaceState({}, "", "/");
      const { result } = renderHook(() => useLocationState());
      expect(result.current.location).toEqual({
        view: "workspace",
        sub: "inbox",
      });
      expect(window.location.pathname).toBe("/workspace/inbox");
    });

    it("defaults /workspace to workspace/inbox and replaces URL", () => {
      window.history.replaceState({}, "", "/workspace");
      const { result } = renderHook(() => useLocationState());
      expect(result.current.location).toEqual({
        view: "workspace",
        sub: "inbox",
      });
      expect(window.location.pathname).toBe("/workspace/inbox");
    });

    it("defaults /settings to settings/import-export and replaces URL", () => {
      window.history.replaceState({}, "", "/settings");
      const { result } = renderHook(() => useLocationState());
      expect(result.current.location).toEqual({
        view: "settings",
        sub: "import-export",
      });
      expect(window.location.pathname).toBe("/settings/import-export");
    });
  });

  describe("navigate", () => {
    it("updates state and URL on navigate", () => {
      const { result } = renderHook(() => useLocationState());

      act(() => {
        result.current.navigate("settings", "labels");
      });

      expect(result.current.location).toEqual({
        view: "settings",
        sub: "labels",
      });
      expect(window.location.pathname).toBe("/settings/labels");
    });

    it("pushes to history stack (not replace)", () => {
      const pushSpy = vi.spyOn(window.history, "pushState");
      const { result } = renderHook(() => useLocationState());

      act(() => {
        result.current.navigate("workspace", "next");
      });

      expect(pushSpy).toHaveBeenCalledWith({}, "", "/workspace/next");
    });

    it("navigates between multiple locations", () => {
      const { result } = renderHook(() => useLocationState());

      act(() => {
        result.current.navigate("settings", "preferences");
      });
      expect(result.current.location.view).toBe("settings");
      expect(result.current.location.sub).toBe("preferences");

      act(() => {
        result.current.navigate("workspace", "focus");
      });
      expect(result.current.location.view).toBe("workspace");
      expect(result.current.location.sub).toBe("focus");
    });
  });

  describe("popstate (browser back/forward)", () => {
    it("updates state on popstate event", () => {
      const { result } = renderHook(() => useLocationState());

      // Navigate forward
      act(() => {
        result.current.navigate("settings", "labels");
      });
      expect(result.current.location.view).toBe("settings");

      // Simulate browser back: manually set URL and dispatch popstate
      act(() => {
        window.history.replaceState({}, "", "/workspace/inbox");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(result.current.location).toEqual({
        view: "workspace",
        sub: "inbox",
      });
    });
  });
});
