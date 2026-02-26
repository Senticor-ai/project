import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ToastProvider } from "./components/ui/ToastProvider";
import { DevApi, EmailApi } from "./lib/api-client";

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
  ConnectedBucketView: ({ activeBucket }: { activeBucket: string }) => (
    <div data-testid="connected-bucket-view" data-bucket={activeBucket} />
  ),
}));

vi.mock("./components/settings/SettingsScreen", () => ({
  SettingsScreen: ({
    activeTab,
    onImportNirvana,
    onFlush,
  }: {
    activeTab?: string;
    onImportNirvana?: () => void;
    onFlush?: () => Promise<unknown>;
  }) => (
    <div data-testid="settings-screen" data-tab={activeTab}>
      <button onClick={onImportNirvana}>Import from Nirvana</button>
      <button
        onClick={() => {
          void onFlush?.();
        }}
      >
        Flush all data
      </button>
    </div>
  ),
}));

vi.mock("./features/imports/nirvana/NirvanaImportDialog", () => ({
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

vi.mock("./hooks/use-import-jobs", () => ({
  useImportJobs: () => ({
    jobs: [],
    checkDuplicate: () => null,
    isLoading: false,
    retryJob: { mutate: vi.fn(), isPending: false, variables: undefined },
    archiveJob: { mutate: vi.fn(), isPending: false, variables: undefined },
  }),
}));

vi.mock("./hooks/use-import-job-toasts", () => ({
  useImportJobToasts: () => {},
}));

let queryClient: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Reset URL to default before each test
  window.history.replaceState({}, "", "/workspace/inbox");
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderApp() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function renderAuthenticated() {
  mockUseAuth.mockReturnValue({
    user: { id: "u-1", email: "test@example.com", username: "testuser" },
    isLoading: false,
    login: mockLogin,
    register: mockRegister,
    logout: mockLogout,
  });
  return renderApp();
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

    renderApp();
    expect(
      screen.getByRole("status", { name: "Loading app" }),
    ).toBeInTheDocument();
  });

  it("shows LoginPage when user is not authenticated", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
    });

    renderApp();
    expect(
      screen.queryByTestId("connected-bucket-view"),
    ).not.toBeInTheDocument();
  });

  it("shows workspace when user is authenticated", async () => {
    const user = userEvent.setup();
    renderAuthenticated();
    expect(screen.getByTestId("connected-bucket-view")).toBeInTheDocument();
    // Username is inside the menu, not visible in the header bar
    await user.click(screen.getByRole("button", { name: "Main menu" }));
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

    expect(await screen.findByTestId("settings-screen")).toBeInTheDocument();
    expect(
      screen.queryByTestId("connected-bucket-view"),
    ).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/settings/import-export");
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
    expect(window.location.pathname).toBe("/workspace/inbox");
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

  it("flush triggers sync for active email connections", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/settings/developer");

    vi.spyOn(DevApi, "flush").mockResolvedValue({
      ok: true,
      deleted: {},
    });
    vi.spyOn(EmailApi, "listConnections").mockResolvedValue([
      {
        connection_id: "conn-1",
        email_address: "sync@example.com",
        display_name: "Sync",
        auth_method: "oauth2",
        oauth_provider: "gmail",
        sync_interval_minutes: 0,
        sync_mark_read: false,
        is_active: true,
        last_sync_at: null,
        last_sync_error: null,
        last_sync_message_count: null,
        watch_active: false,
        watch_expires_at: null,
        created_at: "2026-01-01T00:00:00Z",
        calendar_sync_enabled: false,
      },
    ]);
    const triggerSyncSpy = vi.spyOn(EmailApi, "triggerSync").mockResolvedValue({
      synced: 0,
      created: 0,
      skipped: 0,
      errors: 0,
      calendar_synced: 0,
      calendar_created: 0,
      calendar_updated: 0,
      calendar_archived: 0,
      calendar_errors: 0,
    });

    renderAuthenticated();

    await user.click(screen.getByText("Flush all data"));

    await waitFor(() => {
      expect(triggerSyncSpy).toHaveBeenCalledWith("conn-1");
    });
  });

  // -------------------------------------------------------------------------
  // Deep linking tests
  // -------------------------------------------------------------------------

  it("renders settings when URL starts at /settings/labels", () => {
    window.history.replaceState({}, "", "/settings/labels");
    renderAuthenticated();
    expect(screen.getByTestId("settings-screen")).toBeInTheDocument();
    expect(screen.getByTestId("settings-screen")).toHaveAttribute(
      "data-tab",
      "labels",
    );
    expect(
      screen.queryByTestId("connected-bucket-view"),
    ).not.toBeInTheDocument();
  });

  it("renders workspace with specific bucket from URL", () => {
    window.history.replaceState({}, "", "/workspace/next");
    renderAuthenticated();
    expect(screen.getByTestId("connected-bucket-view")).toBeInTheDocument();
    expect(screen.getByTestId("connected-bucket-view")).toHaveAttribute(
      "data-bucket",
      "next",
    );
  });

  it("preserves URL through login for deep linking", () => {
    window.history.replaceState({}, "", "/settings/preferences");
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
    });

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(<App />, { wrapper: Wrapper });
    // URL preserved while showing login
    expect(window.location.pathname).toBe("/settings/preferences");

    // Simulate successful login
    mockUseAuth.mockReturnValue({
      user: { id: "u-1", email: "test@example.com", username: "testuser" },
      isLoading: false,
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
    });
    rerender(<App />);

    // Now shows settings at the deep-linked tab
    expect(screen.getByTestId("settings-screen")).toBeInTheDocument();
    expect(screen.getByTestId("settings-screen")).toHaveAttribute(
      "data-tab",
      "preferences",
    );
  });

  it("handles browser back navigation via popstate", async () => {
    const user = userEvent.setup();
    renderAuthenticated();

    // Navigate to settings
    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Settings"));
    expect(screen.getByTestId("settings-screen")).toBeInTheDocument();

    // Simulate browser back: set URL and dispatch popstate
    act(() => {
      window.history.replaceState({}, "", "/workspace/inbox");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.getByTestId("connected-bucket-view")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-screen")).not.toBeInTheDocument();
  });

  it("hides floating chat launcher while chat is open", async () => {
    const user = userEvent.setup();
    renderAuthenticated();

    await user.click(screen.getByRole("button", { name: "Chat öffnen" }));
    expect(
      screen.queryByRole("button", { name: "Chat öffnen" }),
    ).not.toBeInTheDocument();

    const panel = screen.getByRole("complementary", { name: "Copilot Chat" });
    await user.click(
      within(panel).getByRole("button", { name: "Chat minimieren" }),
    );

    expect(
      screen.getByRole("button", { name: "Chat öffnen" }),
    ).toBeInTheDocument();
  });
});
