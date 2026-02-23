import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ToastContext } from "@/lib/toast-context";
import type { Toast, ToastType, ToastAction } from "@/lib/toast-context";
import { ToastContainer } from "./ToastContainer";

const AUTO_DISMISS_MS = 5_000;

function MutationErrorBridge({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const cache = queryClient.getMutationCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event.type === "updated" && event.mutation.state.status === "error") {
        const err = event.mutation.state.error;
        onError(err?.message ?? "An operation failed");
      }
    });
    return unsubscribe;
  }, [queryClient, onError]);

  return null;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (
      message: string,
      type: ToastType = "error",
      options?: { action?: ToastAction; persistent?: boolean },
    ) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [
        ...prev,
        {
          id,
          message,
          type,
          action: options?.action,
          persistent: options?.persistent,
        },
      ]);
      if (!options?.persistent) {
        const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
        timers.current.set(id, timer);
      }
    },
    [dismiss],
  );

  // Clear all timers on unmount
  useEffect(() => {
    const current = timers.current;
    return () => {
      for (const timer of current.values()) clearTimeout(timer);
      current.clear();
    };
  }, []);

  const handleMutationError = useCallback(
    (message: string) => toast(message, "error"),
    [toast],
  );

  const value = useMemo(
    () => ({ toasts, toast, dismiss }),
    [toasts, toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <MutationErrorBridge onError={handleMutationError} />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
