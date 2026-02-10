import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import type { Toast } from "@/lib/toast-context";

const typeConfig: Record<
  Toast["type"],
  { icon: string; iconClass: string; borderClass: string }
> = {
  error: {
    icon: "error",
    iconClass: "text-red-500",
    borderClass: "border-red-200",
  },
  success: {
    icon: "check_circle",
    iconClass: "text-green-600",
    borderClass: "border-green-200",
  },
  info: {
    icon: "info",
    iconClass: "text-blue-500",
    borderClass: "border-blue-200",
  },
};

export interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return createPortal(
    <div
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 flex flex-col gap-2"
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const cfg = typeConfig[t.type];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 80 }}
              transition={{ duration: 0.2 }}
              role="alert"
              className={`flex max-w-sm items-center gap-2 rounded-[var(--radius-md)] border ${cfg.borderClass} bg-surface-raised px-3 py-2 shadow-[var(--shadow-sheet)]`}
            >
              <Icon name={cfg.icon} size={18} className={cfg.iconClass} />
              <span className="flex-1 text-sm text-text">{t.message}</span>
              <button
                onClick={() => onDismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 text-text-subtle hover:text-text"
              >
                <Icon name="close" size={16} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
