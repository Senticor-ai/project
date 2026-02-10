import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./lib/api-client";
import { AuthProvider } from "./lib/auth-context";
import { ToastProvider } from "./components/ui/ToastProvider";
import "./index.css";
import App from "./App.tsx";

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
      {import.meta.env.DEV && (
        <Suspense fallback={null}>
          <ReactQueryDevtools
            initialIsOpen={false}
            buttonPosition="bottom-left"
          />
        </Suspense>
      )}
    </QueryClientProvider>
  </StrictMode>,
);
