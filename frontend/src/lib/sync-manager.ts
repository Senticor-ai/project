/**
 * Register a one-shot Background Sync tag.
 * Returns false if the Background Sync API is unavailable
 * (e.g. desktop Chrome without service worker, Firefox, Safari).
 *
 * For now, TanStack Query's offlineFirst in-memory queue handles
 * retry while the tab is open. Background Sync adds "survive tab close"
 * on Android Chrome.
 */
export async function registerBackgroundSync(tag: string): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    if ("sync" in registration) {
      await (
        registration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> };
        }
      ).sync.register(tag);
      return true;
    }
  } catch {
    // Background Sync not supported or denied
  }

  return false;
}
