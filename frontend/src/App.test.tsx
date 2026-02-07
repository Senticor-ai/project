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

vi.mock("./components/settings/SettingsScreen", () => ({
  SettingsScreen: ({ onImportNirvana }: { onImportNirvana?: () => void }) => (
    <div data-testid="settings-screen">
      <button onClick={onImportNirvana}>Import from Nirvana</button>
    </div>
  ),
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
// Helpers
// ---------------------------------------------------------------------------

function renderAuthenticated() {
  mockUseAuth.mockReturnValue({
    user: { id: "u-1", email: "test@example.com", username: "testuser" },
    isLoading: false,
    login: mockLogin,
    register: mockRegister,
    logout: mockLogout,
  });
  return render(<App />);
}

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
    expect(
      screen.queryByTestId("connected-bucket-view"),
    ).not.toBeInTheDocument();
  });

  it("shows workspace when user is authenticated", () => {
    renderAuthenticated();
    expect(screen.getByTestId("connected-bucket-view")).toBeInTheDocument();
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("calls logout when Sign out is clicked in menu", async () => {
    const user = userEvent.setup();
    renderAuthenticated();

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Sign out"));

    expect(mockLogout).toHaveBeenCalled();
  });

  it("shows settings when navigating via menu", async () => {
    const user = userEvent.setup();
    renderAuthenticated();

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Settings"));

    expect(screen.getByTestId("settings-screen")).toBeInTheDocument();
    expect(
      screen.queryByTestId("connected-bucket-view"),
    ).not.toBeInTheDocument();
  });

  it("navigates back to workspace from settings", async () => {
    const user = userEvent.setup();
    renderAuthenticated();

    // Go to settings
    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Settings"));
    expect(screen.getByTestId("settings-screen")).toBeInTheDocument();

    // Go back to workspace
    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Workspace"));
    expect(screen.getByTestId("connected-bucket-view")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-screen")).not.toBeInTheDocument();
  });

  it("opens import dialog from settings", async () => {
    const user = userEvent.setup();
    renderAuthenticated();

    // Navigate to settings
    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Settings"));

    // Click import in settings
    await user.click(screen.getByText("Import from Nirvana"));
    expect(screen.getByTestId("import-dialog")).toBeInTheDocument();
  });
});
