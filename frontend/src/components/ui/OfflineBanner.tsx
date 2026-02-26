import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="status"
          className="overflow-hidden"
        >
          <div className="flex items-center justify-center gap-2 bg-status-warning/10 px-4 py-2 text-sm text-status-warning">
            <Icon name="cloud_off" size={16} />
            <span>You are offline — changes will sync when reconnected</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
