import {
  useState,
  useRef,
  useEffect,
  useId,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface TooltipProps {
  /** Tooltip text. Falls back to the child's aria-label when omitted. */
  label?: string;
  /** Preferred placement. Default: "top". */
  placement?: "top" | "bottom";
  /** Delay in ms before the tooltip appears. Default: 400. */
  delay?: number;
  children: ReactNode;
  className?: string;
}

export function Tooltip({
  label,
  placement = "top",
  delay = 400,
  children,
  className,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [derivedLabel, setDerivedLabel] = useState<string | undefined>(
    undefined,
  );
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tooltipId = useId();

  const effectiveLabel = label ?? derivedLabel;

  const show = useCallback(() => {
    // Derive aria-label from DOM at interaction time (not during render)
    if (!label && triggerRef.current) {
      const labeled = triggerRef.current.querySelector("[aria-label]");
      setDerivedLabel(labeled?.getAttribute("aria-label") ?? undefined);
    }
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = undefined;
      setIsVisible(true);
    }, delay);
  }, [delay, label]);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setIsVisible(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  // Calculate position when visible
  useEffect(() => {
    if (!isVisible || !triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const tooltipWidth = tooltipEl?.offsetWidth ?? 0;
    const tooltipHeight = tooltipEl?.offsetHeight ?? 0;
    const gap = 6;

    let top: number;
    if (placement === "bottom") {
      top = triggerRect.bottom + gap;
    } else {
      top = triggerRect.top - tooltipHeight - gap;
      // Flip to bottom if no space above
      if (top < 4) {
        top = triggerRect.bottom + gap;
      }
    }

    // Center horizontally, clamp to viewport
    let left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tooltipWidth - 4));

    setPosition({ top, left });
  }, [isVisible, placement]);

  return (
    <span
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      className="inline-flex"
    >
      {children}
      {isVisible &&
        effectiveLabel &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-50 max-w-xs whitespace-nowrap rounded-[var(--radius-sm)] px-2 py-1 text-xs",
              "bg-text text-surface shadow-[var(--shadow-card)]",
              className,
            )}
            style={{ top: position.top, left: position.left }}
          >
            {effectiveLabel}
          </div>,
          document.body,
        )}
    </span>
  );
}
