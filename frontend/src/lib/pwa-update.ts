import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Hook that wraps vite-plugin-pwa's service worker registration.
 * Returns whether a new version is available and a function to apply the update.
 */
export function usePwaUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Check for updates every 60 minutes
      if (registration) {
        setInterval(
          () => {
            registration.update();
          },
          60 * 60 * 1000,
        );
      }
    },
  });

  return { needRefresh, updateServiceWorker };
}
