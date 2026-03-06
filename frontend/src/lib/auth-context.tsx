import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  AuthApi,
  refreshCsrfToken,
  setSessionExpiredHandler,
} from "./api-client";
import type { AuthUser } from "./api-client";
import { AuthContext } from "./auth-types";
import {
  getCachedAuthUser,
  setCachedAuthUser,
  clearCachedAuthUser,
} from "./auth-cache";
import { setFaroUser } from "./faro";
import { FirstLoginDisclaimerModal } from "@/components/auth/FirstLoginDisclaimerModal";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const showDisclaimerModal = Boolean(user && !user.disclaimer_acknowledged_at);

  // Restore session on mount
  useEffect(() => {
    const controller = new AbortController();
    AuthApi.me(controller.signal)
      .then((u) => {
        if (!controller.signal.aborted) {
          setUser(u);
          setFaroUser(u);
          void setCachedAuthUser(u);
          return refreshCsrfToken();
        }
      })
      .catch(async (err) => {
        if (controller.signal.aborted) return;
        // Network error + browser offline → try cached user
        const isNetworkError = err instanceof ApiError && err.status === 0;
        if (isNetworkError && !navigator.onLine) {
          const cached = await getCachedAuthUser();
          if (cached && !controller.signal.aborted) {
            setUser(cached);
            setFaroUser(cached);
          }
        }
        // Otherwise: not authenticated — that's fine
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, []);

  // Register session-expired handler for automatic 401 recovery
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setFaroUser(null);
      void clearCachedAuthUser();
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const u = await AuthApi.login(email, password);
    setUser(u);
    setFaroUser(u);
    void setCachedAuthUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setError(null);
    const u = await AuthApi.register(email, password);
    setUser(u);
    setFaroUser(u);
    await refreshCsrfToken();
  }, []);

  const logout = useCallback(async () => {
    await AuthApi.logout();
    setUser(null);
    setFaroUser(null);
    void clearCachedAuthUser();
    window.history.replaceState({}, "", "/");
  }, []);

  const acknowledgeDisclaimer = useCallback(async () => {
    if (!user) return;

    try {
      const updatedUser = await AuthApi.acknowledgeDisclaimer();
      setUser(updatedUser);
      setFaroUser(updatedUser);
    } catch (err) {
      console.error("Failed to acknowledge disclaimer:", err);
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, error, login, register, logout }}
    >
      {children}
      <FirstLoginDisclaimerModal
        isOpen={showDisclaimerModal}
        onAcknowledge={acknowledgeDisclaimer}
      />
    </AuthContext.Provider>
  );
}
