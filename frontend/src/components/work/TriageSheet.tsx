import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

const BUCKET_BUTTONS = [
  { bucket: "next", label: "Next", icon: "bolt", colorClass: "text-app-next" },
  {
    bucket: "waiting",
    label: "Waiting",
    icon: "schedule",
    colorClass: "text-app-waiting",
  },
  {
    bucket: "calendar",
    label: "Calendar",
    icon: "calendar_month",
    colorClass: "text-app-calendar",
  },
  {
    bucket: "someday",
    label: "Later",
    icon: "cloud",
    colorClass: "text-app-someday",
  },
  {
    bucket: "reference",
    label: "Reference",
    icon: "description",
    colorClass: "text-text-muted",
  },
] as const;

export interface TriageSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onMove: (bucket: string) => void;
  onArchive: () => void;
  itemName: string;
}

export function TriageSheet({
  isOpen,
  onClose,
  onMove,
  onArchive,
  itemName,
}: TriageSheetProps) {
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  // Focus first bucket button when opening
  useEffect(() => {
    if (isOpen) {
      // Delay to let animation start
      const id = setTimeout(() => firstButtonRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            data-testid="triage-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />
          {/* Sheet */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Triage: ${itemName}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 rounded-t-2xl",
              "border-t border-border bg-surface px-4 pb-6 pt-3",
              "safe-area-pb",
            )}
          >
            {/* Drag handle */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />

            {/* Item name */}
            <p className="mb-3 truncate text-sm font-medium text-text-primary">
              {itemName}
            </p>

            {/* Bucket buttons */}
            <div className="grid grid-cols-3 gap-2">
              {BUCKET_BUTTONS.map(({ bucket, label, icon, colorClass }, i) => (
                <button
                  key={bucket}
                  ref={i === 0 ? firstButtonRef : undefined}
                  onClick={() => onMove(bucket)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-[var(--radius-md)]",
                    "border border-border bg-paper-50 px-3 py-3 text-xs font-medium",
                    "active:scale-95 transition-transform",
                  )}
                >
                  <Icon name={icon} size={20} className={colorClass} />
                  {label}
                </button>
              ))}
              <button
                onClick={onArchive}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-[var(--radius-md)]",
                  "border border-border bg-paper-50 px-3 py-3 text-xs font-medium text-text-muted",
                  "active:scale-95 transition-transform",
                )}
              >
                <Icon name="archive" size={20} />
                Archive
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
