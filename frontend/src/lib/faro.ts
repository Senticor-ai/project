import {
  initializeFaro,
  getWebInstrumentations,
  type Faro,
} from "@grafana/faro-web-sdk";
import type { AuthUser } from "./api-client";

const COLLECTOR_URL = import.meta.env.VITE_FARO_COLLECTOR_URL ?? "";
const APP_NAME = import.meta.env.VITE_FARO_APP_NAME ?? "copilot-frontend";
const ENVIRONMENT = import.meta.env.VITE_FARO_ENVIRONMENT ?? "development";

let faro: Faro | null = null;

/**
 * Initialize the Grafana Faro Web SDK.
 *
 * Must be called once at app startup (before React renders).
 * Returns `null` if `VITE_FARO_COLLECTOR_URL` is not configured,
 * allowing local development without a collector.
 */
export function initFaro(): Faro | null {
  if (faro) {
    return faro;
  }

  if (!COLLECTOR_URL) {
    return null;
  }

  try {
    faro = initializeFaro({
      url: COLLECTOR_URL,
      app: {
        name: APP_NAME,
        environment: ENVIRONMENT,
      },
      instrumentations: [...getWebInstrumentations()],
    });

    faro.api.pushEvent("app_bootstrapped", {
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn(
      "[faro] initialization failed, continuing without observability",
      err,
    );
    faro = null;
    return null;
  }

  return faro;
}

/** Return the current Faro instance (or `null` if not initialized). */
export function getFaro(): Faro | null {
  return faro;
}

/**
 * Set or clear the authenticated user context in Faro.
 *
 * Call with an `AuthUser` on login/session-restore and `null` on logout.
 */
export function setFaroUser(user: AuthUser | null): void {
  if (!faro) {
    return;
  }

  if (user) {
    faro.api.setUser({
      id: user.id,
      email: user.email,
      username: user.username ?? undefined,
    });
  } else {
    faro.api.resetUser();
  }
}
