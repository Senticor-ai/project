import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "./auth-context";
import { useAuth } from "./use-auth";
import { AuthApi, refreshCsrfToken } from "./api-client";
import type { AuthUser } from "./api-client";

vi.mock("./api-client", () => ({
  AuthApi: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
  refreshCsrfToken: vi.fn(),
  setUserContext: vi.fn(),
  setCsrfToken: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const mockedAuth = vi.mocked(AuthApi);
const mockedRefreshCsrf = vi.mocked(refreshCsrfToken);

const MOCK_USER: AuthUser = {
  id: "u-1",
  email: "test@example.com",
  username: "test",
  created_at: "2026-01-01T00:00:00Z",
};

/** Test component that exposes AuthContext values */
function AuthConsumer() {
  const { user, isLoading, error, login, register, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user ? user.email : "none"}</span>
      <span data-testid="error">{error ?? "none"}</span>
      <button onClick={() => login("a@b.com", "pass")}>Login</button>
      <button onClick={() => register("a@b.com", "pass")}>Register</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthProvider", () => {
  it("starts in loading state and resolves after session check", async () => {
    mockedAuth.me.mockRejectedValue(new Error("no session"));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    // Initially loading
    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    // Resolves to not authenticated
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("restores session from /auth/me on mount", async () => {
    mockedAuth.me.mockResolvedValue(MOCK_USER);
    mockedRefreshCsrf.mockResolvedValue("csrf-token");

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("test@example.com"),
    );
    expect(mockedRefreshCsrf).toHaveBeenCalled();
  });

  it("login updates user state", async () => {
    mockedAuth.me.mockRejectedValue(new Error("no session"));
    mockedAuth.login.mockResolvedValue(MOCK_USER);

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("test@example.com"),
    );
  });

  it("register updates user state and refreshes CSRF", async () => {
    mockedAuth.me.mockRejectedValue(new Error("no session"));
    mockedAuth.register.mockResolvedValue(MOCK_USER);
    mockedRefreshCsrf.mockResolvedValue("csrf-token");

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("test@example.com"),
    );
    expect(mockedRefreshCsrf).toHaveBeenCalled();
  });

  it("logout clears user state", async () => {
    mockedAuth.me.mockResolvedValue(MOCK_USER);
    mockedRefreshCsrf.mockResolvedValue("csrf-token");
    mockedAuth.logout.mockResolvedValue({ ok: true });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("test@example.com"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("none"),
    );
  });
});
