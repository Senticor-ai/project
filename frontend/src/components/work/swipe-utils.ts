/** Result of evaluating a swipe gesture against commit thresholds. */
export type SwipeResult = "commit-right" | "commit-left" | "cancel";

const COMMIT_RATIO = 0.4;
const VELOCITY_THRESHOLD = 800; // px/s

/**
 * Determine whether a swipe gesture commits or cancels.
 *
 * A swipe commits when:
 * - The horizontal offset exceeds 40% of row width, OR
 * - The velocity exceeds 800px/s (fast flick shortcut)
 */
export function computeSwipeResult(
  offsetX: number,
  velocityX: number,
  rowWidth: number,
): SwipeResult {
  const commitDistance = rowWidth * COMMIT_RATIO;

  if (offsetX >= commitDistance || velocityX >= VELOCITY_THRESHOLD) {
    return "commit-right";
  }
  if (offsetX <= -commitDistance || velocityX <= -VELOCITY_THRESHOLD) {
    return "commit-left";
  }
  return "cancel";
}
