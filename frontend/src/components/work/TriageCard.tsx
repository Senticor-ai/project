import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { getDisplayName } from "@/model/types";
import { computeSwipeResult } from "./swipe-utils";
import type { ActionItem } from "@/model/types";

const STACK_OFFSETS = [0, 4, 8];
const STACK_OPACITIES = [1, 0.7, 0.4];

export interface TriageCardProps {
  item: ActionItem;
  /** 0 = active (top), 1/2 = behind */
  stackIndex: number;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  onTap: () => void;
}

export function TriageCard({
  item,
  stackIndex,
  onSwipeRight,
  onSwipeLeft,
  onTap,
}: TriageCardProps) {
  const isActive = stackIndex === 0;
  const x = useMotionValue(0);

  // Derive visual effects from drag position
  const rotate = useTransform(x, [-200, 0, 200], [-8, 0, 8]);
  const bgOpacity = useTransform(x, [-100, 0, 100], [0.15, 0, 0.15]);

  const name = getDisplayName(item);

  return (
    <motion.div
      className={cn(
        "absolute inset-x-0 mx-auto w-full max-w-md rounded-2xl",
        "border border-border bg-surface shadow-lg",
        !isActive && "pointer-events-none",
      )}
      style={{
        x: isActive ? x : 0,
        rotate: isActive ? rotate : 0,
        y: STACK_OFFSETS[stackIndex] ?? 8,
        opacity: STACK_OPACITIES[stackIndex] ?? 0.4,
        zIndex: 10 - stackIndex,
      }}
      drag={isActive ? "x" : false}
      dragDirectionLock
      dragSnapToOrigin={false}
      dragElastic={0.15}
      onDragEnd={(_e, info) => {
        const el = (_e.target as HTMLElement).closest<HTMLElement>(
          "[data-triage-card]",
        );
        const width = el?.offsetWidth ?? 320;
        const result = computeSwipeResult(
          info.offset.x,
          info.velocity.x,
          width,
        );

        if (result === "commit-right") {
          void animate(x, window.innerWidth, { duration: 0.25 });
          // Delay callback so fly-out animation is visible
          setTimeout(onSwipeRight, 250);
        } else if (result === "commit-left") {
          void animate(x, -window.innerWidth, { duration: 0.25 });
          setTimeout(onSwipeLeft, 250);
        } else {
          void animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
        }
      }}
      onClick={() => {
        // Only fire tap if the card hasn't been dragged
        if (Math.abs(x.get()) < 5) {
          onTap();
        }
      }}
      data-triage-card
    >
      {/* Swipe indicators behind card content */}
      {isActive && (
        <motion.div
          className="absolute inset-0 flex items-center justify-between rounded-2xl px-6"
          style={{ opacity: bgOpacity }}
        >
          <Icon name="bolt" size={28} className="text-app-next" />
          <Icon name="schedule" size={28} className="text-app-waiting" />
        </motion.div>
      )}

      {/* Card content */}
      <div className="relative p-5">
        <h3 className="text-base font-semibold text-text-primary">{name}</h3>
        {item.description && (
          <p className="mt-2 line-clamp-3 text-sm text-text-muted">
            {item.description}
          </p>
        )}
        {item.tags && item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-paper-100 px-2 py-0.5 text-[11px] text-text-subtle"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
