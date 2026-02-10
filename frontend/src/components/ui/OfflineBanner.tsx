import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

export function OfflineBanner() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot);

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
          <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <Icon name="cloud_off" size={16} />
            <span>You are offline — changes will sync when reconnected</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
