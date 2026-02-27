import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLongPress } from "./use-long-press";

describe("useLongPress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onLongPress after default 500ms delay", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress }));

    act(() => {
      result.current.onPointerDown({
        clientX: 100,
        clientY: 200,
        pointerId: 1,
      } as React.PointerEvent);
    });

    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire if pointer is released before delay", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress }));

    act(() => {
      result.current.onPointerDown({
        clientX: 100,
        clientY: 200,
        pointerId: 1,
      } as React.PointerEvent);
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    act(() => {
      result.current.onPointerUp();
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cancels if pointer moves beyond threshold", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, moveThreshold: 10 }),
    );

    act(() => {
      result.current.onPointerDown({
        clientX: 100,
        clientY: 200,
        pointerId: 1,
      } as React.PointerEvent);
    });

    // Move 15px — exceeds 10px threshold
    act(() => {
      result.current.onPointerMove({
        clientX: 115,
        clientY: 200,
        pointerId: 1,
      } as React.PointerEvent);
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does not cancel if movement is within threshold", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, moveThreshold: 10 }),
    );

    act(() => {
      result.current.onPointerDown({
        clientX: 100,
        clientY: 200,
        pointerId: 1,
      } as React.PointerEvent);
    });

    // Move 5px — within 10px threshold
    act(() => {
      result.current.onPointerMove({
        clientX: 105,
        clientY: 200,
        pointerId: 1,
      } as React.PointerEvent);
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("respects custom delay", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, delay: 1000 }),
    );

    act(() => {
      result.current.onPointerDown({
        clientX: 0,
        clientY: 0,
        pointerId: 1,
      } as React.PointerEvent);
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("cancels on pointerCancel", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress }));

    act(() => {
      result.current.onPointerDown({
        clientX: 0,
        clientY: 0,
        pointerId: 1,
      } as React.PointerEvent);
    });

    act(() => {
      result.current.onPointerCancel();
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
