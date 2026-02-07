import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AuthApi, refreshCsrfToken } from "./api-client";
import type { AuthUser } from "./api-client";
import { AuthContext } from "./auth-types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    const controller = new AbortController();
    AuthApi.me(controller.signal)
      .then((u) => {
        if (!controller.signal.aborted) {
          setUser(u);
          return refreshCsrfToken();
        }
      })
      .catch(() => {
        // Not authenticated or aborted — that's fine
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const u = await AuthApi.login(email, password);
    setUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setError(null);
    const u = await AuthApi.register(email, password);
    setUser(u);
    await refreshCsrfToken();
  }, []);

  const logout = useCallback(async () => {
    await AuthApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, error, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
