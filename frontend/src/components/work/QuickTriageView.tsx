import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import { TriageCard } from "./TriageCard";
import { TriageSheet } from "./TriageSheet";
import { useSwipeTriageConfig } from "@/hooks/use-swipe-triage-config";
import { useToast } from "@/lib/use-toast";
import { getDisplayName } from "@/model/types";
import type { ActionItem } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

export interface QuickTriageViewProps {
  items: ActionItem[];
  onMove: (id: CanonicalId, bucket: string) => void;
  onArchive: (id: CanonicalId) => void;
  onClose: () => void;
}

const CELEBRATION_DELAY_MS = 1500;

export function QuickTriageView({
  items,
  onMove,
  onArchive,
  onClose,
}: QuickTriageViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const swipeConfig = useSwipeTriageConfig();
  const { toast } = useToast();

  const remaining = items.slice(currentIndex);
  const isDone = remaining.length === 0;
  const activeItem = remaining[0] as ActionItem | undefined;

  // Auto-close after celebration
  useEffect(() => {
    if (isDone) {
      const id = setTimeout(onClose, CELEBRATION_DELAY_MS);
      return () => clearTimeout(id);
    }
  }, [isDone, onClose]);

  function advance(item: ActionItem, bucket: string) {
    const name = getDisplayName(item);
    onMove(item.id, bucket);
    toast(`"${name}" → ${bucket}`, "success", {
      action: {
        label: "Undo",
        onClick: () => onMove(item.id, "inbox"),
      },
    });
    setCurrentIndex((prev) => prev + 1);
    setSheetOpen(false);
  }

  function handleArchive(item: ActionItem) {
    const name = getDisplayName(item);
    onArchive(item.id);
    toast(`"${name}" archived`, "success", {
      action: {
        label: "Undo",
        onClick: () => onMove(item.id, "inbox"),
      },
    });
    setCurrentIndex((prev) => prev + 1);
    setSheetOpen(false);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon name="style" size={16} className="text-blueprint-600" />
          <span className="text-sm font-medium text-text-primary">
            Quick Triage
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!isDone && (
            <span className="text-xs text-text-muted">
              {currentIndex + 1} / {items.length}
            </span>
          )}
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1 text-text-muted hover:bg-paper-100 hover:text-text"
            aria-label="Close quick triage"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      {/* Card area */}
      <div
        role="group"
        aria-roledescription="Quick triage card stack"
        aria-label={
          activeItem
            ? `Card ${currentIndex + 1} of ${items.length}: ${getDisplayName(activeItem)}`
            : "All items triaged"
        }
        className="relative flex-1 overflow-hidden px-4 py-6"
      >
        <AnimatePresence>
          {isDone ? (
            <motion.div
              key="celebration"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex h-full flex-col items-center justify-center gap-3"
              aria-live="assertive"
            >
              <Icon name="check_circle" size={48} className="text-app-next" />
              <p className="text-lg font-semibold text-text-primary">
                Inbox empty — well done!
              </p>
            </motion.div>
          ) : (
            remaining.slice(0, 3).map((item, i) => (
              <TriageCard
                key={item.id}
                item={item}
                stackIndex={i}
                onSwipeRight={() => advance(item, swipeConfig.swipeRight)}
                onSwipeLeft={() => advance(item, swipeConfig.swipeLeft)}
                onTap={() => {
                  if (i === 0) setSheetOpen(true);
                }}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Swipe direction hints */}
      {!isDone && (
        <div className="flex justify-between px-6 pb-4 text-xs text-text-subtle">
          <span className="flex items-center gap-1">
            <Icon name="arrow_back" size={12} />
            Waiting
          </span>
          <span className="flex items-center gap-1">
            Next
            <Icon name="arrow_forward" size={12} />
          </span>
        </div>
      )}

      {/* Triage bottom sheet (tap card to open) */}
      {activeItem && (
        <TriageSheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onMove={(bucket) => advance(activeItem, bucket)}
          onArchive={() => handleArchive(activeItem)}
          itemName={getDisplayName(activeItem)}
        />
      )}
    </div>
  );
}
