import { lazy, Suspense, useEffect, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import App from "@/App";
import { ApiError } from "@/lib/api-client";
import { createIdbPersister } from "@/lib/offline-storage";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { PwaUpdateNotifier } from "@/components/shell/PwaUpdateNotifier";

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : () => null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s before refetch
      networkMode: "offlineFirst",
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});

const STARTUP_ASSET_TIMEOUT_MS = 2_500;
const STARTUP_FADE_MS = 180;
const STARTUP_SPLASH_ID = "startup-splash";
type BootstrapPhase = "loading" | "fading" | "ready";

function supportsFontLoadingApi() {
  return (
    typeof document !== "undefined" &&
    "fonts" in document &&
    typeof document.fonts?.load === "function"
  );
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function waitForStartupAssets() {
  if (!supportsFontLoadingApi()) {
    return Promise.resolve();
  }

  const nextFrame = new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    window.setTimeout(resolve, 0);
  });

  const loadCriticalFonts = nextFrame.then(() =>
    Promise.allSettled([
      document.fonts.load('1em "Material Symbols Outlined"'),
      document.fonts.load('1em "Inter"'),
    ]),
  );

  const timeout = new Promise<void>((resolve) =>
    window.setTimeout(resolve, STARTUP_ASSET_TIMEOUT_MS),
  );

  return Promise.race([loadCriticalFonts, timeout]);
}

function hideDocumentStartupSplash() {
  if (typeof document === "undefined") return;
  const splash = document.getElementById(STARTUP_SPLASH_ID);
  if (!splash) return;

  splash.setAttribute("data-hidden", "true");
  window.setTimeout(() => {
    splash.remove();
  }, STARTUP_FADE_MS + 80);
}

function AppProviders() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: createIdbPersister(),
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      }}
    >
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
        <PwaUpdateNotifier />
      </ToastProvider>
      {import.meta.env.DEV && (
        <Suspense fallback={null}>
          <ReactQueryDevtools
            initialIsOpen={false}
            buttonPosition="bottom-left"
          />
        </Suspense>
      )}
    </PersistQueryClientProvider>
  );
}

export function AppBootstrap() {
  const [phase, setPhase] = useState<BootstrapPhase>(() =>
    supportsFontLoadingApi() ? "loading" : "ready",
  );

  useEffect(() => {
    if (phase !== "loading") return;

    let isUnmounted = false;
    void waitForStartupAssets().finally(() => {
      if (!isUnmounted) {
        setPhase(prefersReducedMotion() ? "ready" : "fading");
      }
    });

    return () => {
      isUnmounted = true;
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "fading") return;

    if (typeof window.requestAnimationFrame !== "function") {
      const timeoutId = window.setTimeout(() => {
        setPhase("ready");
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    const frameId = window.requestAnimationFrame(() => {
      setPhase("ready");
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [phase]);

  useEffect(() => {
    if (phase !== "ready") return;
    hideDocumentStartupSplash();
  }, [phase]);

  if (phase === "loading") return null;

  return (
    <div
      className="min-h-screen bg-surface"
      style={{
        opacity: phase === "ready" ? 1 : 0,
        transition: `opacity ${STARTUP_FADE_MS}ms ease-out`,
      }}
    >
      <AppProviders />
    </div>
  );
}
