import { useRef, useCallback } from "react";

export interface UseLongPressOptions {
  /** Callback fired when the long-press threshold is reached. */
  onLongPress: () => void;
  /** Time in ms the pointer must be held before firing (default 500). */
  delay?: number;
  /** Max pointer movement in px before the gesture is cancelled (default 10). */
  moveThreshold?: number;
}

/**
 * Detects long-press gestures via pointer events.
 *
 * Returns handlers to spread onto any element. The gesture cancels if the
 * pointer moves beyond `moveThreshold` or is released before `delay` elapses.
 */
export function useLongPress({
  onLongPress,
  delay = 500,
  moveThreshold = 10,
}: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPos.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      startPos.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onLongPress();
      }, delay);
    },
    [onLongPress, delay],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPos.current) return;
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > moveThreshold) {
        clear();
      }
    },
    [moveThreshold, clear],
  );

  const onPointerUp = useCallback(() => {
    clear();
  }, [clear]);

  const onPointerCancel = useCallback(() => {
    clear();
  }, [clear]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
