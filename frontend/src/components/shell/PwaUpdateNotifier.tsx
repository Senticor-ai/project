import { useEffect, useRef, useContext } from "react";
import { ToastContext } from "@/lib/toast-context";
import { usePwaUpdate } from "@/lib/pwa-update";

/**
 * Watches for service worker updates and shows a persistent info toast
 * with a "Reload" action button when a new version is available.
 */
export function PwaUpdateNotifier() {
  const ctx = useContext(ToastContext);
  const { needRefresh, updateServiceWorker } = usePwaUpdate();
  const shown = useRef(false);

  useEffect(() => {
    if (needRefresh && !shown.current && ctx) {
      shown.current = true;
      ctx.toast("A new version is available.", "info", {
        persistent: true,
        action: {
          label: "Reload",
          onClick: () => updateServiceWorker(true),
        },
      });
    }
  }, [needRefresh, ctx, updateServiceWorker]);

  return null;
}
