import {
  initializeFaro,
  getWebInstrumentations,
  type Faro,
} from "@grafana/faro-web-sdk";
import { TracingInstrumentation } from "@grafana/faro-web-tracing";
import type { AuthUser } from "./api-client";

const COLLECTOR_URL = import.meta.env.VITE_FARO_COLLECTOR_URL ?? "";
const APP_NAME = import.meta.env.VITE_FARO_APP_NAME ?? "copilot-frontend";
const ENVIRONMENT = import.meta.env.VITE_FARO_ENVIRONMENT ?? "development";

let faro: Faro | null = null;

type FaroSpanAttribute = string | number | boolean;
type FaroSpanAttributes = Record<string, FaroSpanAttribute | undefined>;

export type FaroSpanHandle = {
  setAttribute: (name: string, value: FaroSpanAttribute | undefined) => void;
  recordError: (error: unknown) => void;
};

const noopSpanHandle: FaroSpanHandle = {
  setAttribute: () => {},
  recordError: () => {},
};

function normalizeErrorType(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "errorType" in error &&
    typeof (error as { errorType?: unknown }).errorType === "string"
  ) {
    return (error as { errorType: string }).errorType;
  }
  if (error instanceof Error && error.name) {
    return error.name;
  }
  return "unknown_error";
}

function setSpanAttributes(
  span: { setAttribute: (name: string, value: FaroSpanAttribute) => void },
  attributes: FaroSpanAttributes,
): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    span.setAttribute(name, value);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getAbsoluteOrigin(url: string): string | null {
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function getAbsoluteUrl(url: string): URL | null {
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function buildUrlPrefixPattern(url: URL): RegExp {
  const normalizedPathname =
    url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const base = `${url.origin}${normalizedPathname}`;
  return new RegExp(`^${escapeRegExp(base)}(?:[/?#]|$)`);
}

function buildTracingInstrumentation(): TracingInstrumentation {
  const tracingApiOrigin = getAbsoluteOrigin(
    import.meta.env.VITE_API_BASE_URL ?? "/api",
  );
  const collectorUrl = getAbsoluteUrl(COLLECTOR_URL);

  const instrumentationOptions: {
    ignoreUrls?: Array<string | RegExp>;
    propagateTraceHeaderCorsUrls?: Array<string | RegExp>;
  } = {};

  if (collectorUrl) {
    instrumentationOptions.ignoreUrls = [buildUrlPrefixPattern(collectorUrl)];
  }

  if (tracingApiOrigin) {
    instrumentationOptions.propagateTraceHeaderCorsUrls = [
      new RegExp(`^${escapeRegExp(tracingApiOrigin)}`),
    ];
  }

  return new TracingInstrumentation({
    instrumentationOptions,
  });
}

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
      instrumentations: [
        ...getWebInstrumentations(),
        buildTracingInstrumentation(),
      ],
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

export async function withFaroActiveSpan<T>(
  name: string,
  attributes: FaroSpanAttributes,
  run: (span: FaroSpanHandle) => Promise<T>,
): Promise<T> {
  const otel = faro?.api.getOTEL();
  if (!otel) {
    return run(noopSpanHandle);
  }

  const tracer = otel.trace.getTracer(APP_NAME);
  return tracer.startActiveSpan(name, async (span) => {
    setSpanAttributes(span, attributes);

    const handle: FaroSpanHandle = {
      setAttribute: (attributeName, value) => {
        if (value === undefined) return;
        span.setAttribute(attributeName, value);
      },
      recordError: (error) => {
        if (typeof span.recordException === "function") {
          if (error instanceof Error || typeof error === "string") {
            span.recordException(error);
          } else {
            span.recordException(new Error(normalizeErrorType(error)));
          }
        }
        span.setAttribute("error.type", normalizeErrorType(error));
      },
    };

    try {
      return await run(handle);
    } catch (error) {
      handle.recordError(error);
      throw error;
    } finally {
      span.end();
    }
  });
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
