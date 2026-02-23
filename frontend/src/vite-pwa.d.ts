/// <reference types="vite-plugin-pwa/client" />

/**
 * Chrome-specific event fired when the browser determines the app
 * meets the PWA installability criteria. Not part of lib.dom.d.ts.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
