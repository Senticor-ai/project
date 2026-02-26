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
    iconClass: "text-status-error",
    borderClass: "border-status-error/30",
  },
  success: {
    icon: "check_circle",
    iconClass: "text-status-success",
    borderClass: "border-status-success/30",
  },
  info: {
    icon: "info",
    iconClass: "text-status-info",
    borderClass: "border-status-info/30",
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
      style={{
        bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
        right: "calc(1rem + env(safe-area-inset-right, 0px))",
      }}
      className="fixed z-50 flex flex-col gap-2"
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
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    onDismiss(t.id);
                  }}
                  className="shrink-0 rounded px-2 py-1 text-sm font-medium text-status-info hover:bg-surface-hover"
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => onDismiss(t.id)}
                aria-label="Dismiss"
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-text-subtle hover:text-text"
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
