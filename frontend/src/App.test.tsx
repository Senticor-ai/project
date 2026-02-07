import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLogin = vi.fn();
const mockRegister = vi.fn();
const mockLogout = vi.fn();

const mockUseAuth = vi.fn<
  () => {
    user: { id: string; email: string; username: string } | null;
    isLoading: boolean;
    login: typeof mockLogin;
    register: typeof mockRegister;
    logout: typeof mockLogout;
  }
>();

vi.mock("./lib/use-auth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("./components/work/ConnectedBucketView", () => ({
  ConnectedBucketView: () => <div data-testid="connected-bucket-view" />,
}));

vi.mock("./components/work/NirvanaImportDialog", () => ({
  NirvanaImportDialog: ({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="import-dialog">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("App", () => {
  it("shows loading spinner while auth is loading", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
    });

    render(<App />);
    expect(screen.getByText("progress_activity")).toBeInTheDocument();
  });

  it("shows LoginPage when user is not authenticated", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
    });

    render(<App />);
    // LoginPage has a "Sign in" heading or similar
    expect(screen.queryByTestId("connected-bucket-view")).not.toBeInTheDocument();
  });

  it("shows workspace when user is authenticated", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u-1", email: "test@example.com", username: "testuser" },
      isLoading: false,
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
    });

    render(<App />);
    expect(screen.getByTestId("connected-bucket-view")).toBeInTheDocument();
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("calls logout when sign out is clicked", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u-1", email: "test@example.com", username: "testuser" },
      isLoading: false,
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
    });

    render(<App />);
    await userEvent.click(screen.getByText("Sign out"));
    expect(mockLogout).toHaveBeenCalled();
  });

  it("opens import dialog when Import is clicked", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u-1", email: "test@example.com", username: "testuser" },
      isLoading: false,
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
    });

    render(<App />);
    expect(screen.queryByTestId("import-dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Import"));
    expect(screen.getByTestId("import-dialog")).toBeInTheDocument();
  });
});
