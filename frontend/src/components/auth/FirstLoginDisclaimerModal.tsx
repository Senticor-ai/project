import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import { getMessage } from "@/lib/messages";

export interface FirstLoginDisclaimerModalProps {
  isOpen: boolean;
  onAcknowledge: () => void;
}

export function FirstLoginDisclaimerModal({
  isOpen,
  onAcknowledge,
}: FirstLoginDisclaimerModalProps) {
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50"
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="disclaimer-title"
              className="w-full max-w-md rounded-[var(--radius-md)] border border-border bg-surface-raised p-6 shadow-[var(--shadow-sheet)]"
            >
              {/* Header */}
              <div className="mb-4 flex items-start gap-3">
                <Icon
                  name="warning"
                  size={24}
                  className="shrink-0 text-status-warning"
                />
                <h2
                  id="disclaimer-title"
                  className="text-base font-medium text-text"
                >
                  {getMessage("disclaimer.dev.modal.title")}
                </h2>
              </div>

              {/* Content */}
              <div className="space-y-4">
                <p className="text-sm text-text-muted">
                  {getMessage("disclaimer.dev.modal.intro")}
                </p>

                <ul className="space-y-2">
                  <li className="flex gap-2 text-sm text-text">
                    <Icon
                      name="circle"
                      size={6}
                      fill
                      className="mt-1.5 shrink-0 text-text-subtle"
                    />
                    <span>{getMessage("disclaimer.dev.modal.point1")}</span>
                  </li>
                  <li className="flex gap-2 text-sm text-text">
                    <Icon
                      name="circle"
                      size={6}
                      fill
                      className="mt-1.5 shrink-0 text-text-subtle"
                    />
                    <span>{getMessage("disclaimer.dev.modal.point2")}</span>
                  </li>
                  <li className="flex gap-2 text-sm text-text">
                    <Icon
                      name="circle"
                      size={6}
                      fill
                      className="mt-1.5 shrink-0 text-text-subtle"
                    />
                    <span>{getMessage("disclaimer.dev.modal.point3")}</span>
                  </li>
                  <li className="flex gap-2 text-sm text-text">
                    <Icon
                      name="circle"
                      size={6}
                      fill
                      className="mt-1.5 shrink-0 text-text-subtle"
                    />
                    <span>{getMessage("disclaimer.dev.modal.point4")}</span>
                  </li>
                </ul>
              </div>

              {/* Footer */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={onAcknowledge}
                  className="rounded-sm bg-blueprint-600 px-4 py-2 text-sm text-white transition-colors duration-[var(--duration-fast)] hover:bg-blueprint-700"
                >
                  {getMessage("disclaimer.dev.modal.acknowledge")}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
