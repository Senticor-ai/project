import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { AuthApi, refreshCsrfToken } from "./api-client";
import type { AuthUser } from "./api-client";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    let cancelled = false;
    AuthApi.me()
      .then((u) => {
        if (!cancelled) {
          setUser(u);
          return refreshCsrfToken();
        }
      })
      .catch(() => {
        // Not authenticated — that's fine
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const u = await AuthApi.login(email, password);
    setUser(u);
  }, []);

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      setError(null);
      const u = await AuthApi.register(email, username, password);
      setUser(u);
      await refreshCsrfToken();
    },
    [],
  );

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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
