import { useCallback, useRef, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  type PanInfo,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { computeSwipeResult } from "./swipe-utils";

export interface SwipeIndicatorConfig {
  bucket: string;
  label: string;
  icon: string;
  colorClass: string;
  bgClass: string;
  bgCommitClass: string;
  borderClass: string;
}

export interface SwipeableRowProps {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightIndicator?: SwipeIndicatorConfig;
  leftIndicator?: SwipeIndicatorConfig;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

const EASE_SNAP = [0.2, 0.8, 0.2, 1] as const;

export function SwipeableRow({
  onSwipeRight,
  onSwipeLeft,
  rightIndicator,
  leftIndicator,
  disabled = false,
  children,
  className,
}: SwipeableRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isEdgeSwipeRef = useRef(false);
  const x = useMotionValue(0);

  // Derive indicator opacity from drag distance (0 → 1 over commit threshold)
  const rightOpacity = useTransform(x, [0, 60], [0, 1], { clamp: true });
  const leftOpacity = useTransform(x, [-60, 0], [1, 0], { clamp: true });

  // Derive icon scale: 0.8 → 1.0 at threshold, 1.2 beyond
  const rightIconScale = useTransform(x, [0, 100, 200], [0.8, 1.0, 1.2], {
    clamp: true,
  });
  const leftIconScale = useTransform(x, [-200, -100, 0], [1.2, 1.0, 0.8], {
    clamp: true,
  });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Exclude leftmost 20px for iOS Safari back gesture
    isEdgeSwipeRef.current = e.clientX < 20;
  }, []);

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (isEdgeSwipeRef.current) return;

      const rowWidth = containerRef.current?.offsetWidth ?? 375;
      const result = computeSwipeResult(
        info.offset.x,
        info.velocity.x,
        rowWidth,
      );

      if (result === "commit-right" && onSwipeRight) {
        void animate(x, window.innerWidth * 1.2, {
          duration: 0.25,
          ease: [...EASE_SNAP],
          onComplete: onSwipeRight,
        });
      } else if (result === "commit-left" && onSwipeLeft) {
        void animate(x, -window.innerWidth * 1.2, {
          duration: 0.25,
          ease: [...EASE_SNAP],
          onComplete: onSwipeLeft,
        });
      } else {
        void animate(x, 0, {
          type: "spring",
          stiffness: 500,
          damping: 30,
        });
      }
    },
    [onSwipeRight, onSwipeLeft, x],
  );

  if (disabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={
        rightIndicator && leftIndicator
          ? `Swipe right for ${rightIndicator.label}, left for ${leftIndicator.label}`
          : rightIndicator
            ? `Swipe right for ${rightIndicator.label}`
            : leftIndicator
              ? `Swipe left for ${leftIndicator.label}`
              : undefined
      }
      className={cn("relative overflow-hidden", className)}
    >
      {/* Background indicator layers */}
      {rightIndicator && (
        <motion.div
          className={cn(
            "absolute inset-0 flex items-center justify-start pl-4",
            rightIndicator.bgClass,
          )}
          style={{ opacity: rightOpacity }}
          aria-hidden="true"
        >
          <motion.span
            style={{ scale: rightIconScale }}
            className={cn("mr-2", rightIndicator.colorClass)}
          >
            <Icon name={rightIndicator.icon} size={20} />
          </motion.span>
          <span
            className={cn("text-xs font-medium", rightIndicator.colorClass)}
          >
            {rightIndicator.label}
          </span>
        </motion.div>
      )}
      {leftIndicator && (
        <motion.div
          className={cn(
            "absolute inset-0 flex items-center justify-end pr-4",
            leftIndicator.bgClass,
          )}
          style={{ opacity: leftOpacity }}
          aria-hidden="true"
        >
          <span className={cn("text-xs font-medium", leftIndicator.colorClass)}>
            {leftIndicator.label}
          </span>
          <motion.span
            style={{ scale: leftIconScale }}
            className={cn("ml-2", leftIndicator.colorClass)}
          >
            <Icon name={leftIndicator.icon} size={20} />
          </motion.span>
        </motion.div>
      )}

      {/* Draggable foreground content */}
      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragSnapToOrigin={false}
        dragElastic={0.3}
        dragConstraints={{ left: 0, right: 0 }}
        onPointerDown={handlePointerDown}
        onDragEnd={handleDragEnd}
        className="relative z-10 bg-surface"
      >
        {children}
      </motion.div>
    </div>
  );
}
