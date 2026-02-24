import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppHeader } from "./AppHeader";

const defaults = {
  username: "testuser",
  currentView: "workspace" as const,
  onNavigate: vi.fn(),
  onSignOut: vi.fn(),
  onLogoClick: vi.fn(),
};

describe("AppHeader", () => {
  it("renders logo with tooltip and no visible app name text", () => {
    render(<AppHeader {...defaults} />);
    expect(screen.getByAltText("Senticor Project")).toBeInTheDocument();
    expect(screen.getByTitle("Senticor Project")).toBeInTheDocument();
    // Username is now inside the menu, not visible in the header bar
    expect(screen.queryByText("testuser")).not.toBeInTheDocument();
  });

  it("renders hamburger menu trigger", () => {
    render(<AppHeader {...defaults} />);
    expect(
      screen.getByRole("button", { name: "Main menu" }),
    ).toBeInTheDocument();
  });

  it("shows username and app info inside the menu", async () => {
    const user = userEvent.setup();
    render(<AppHeader {...defaults} appVersion="0.1.0" />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    expect(screen.getByText("testuser")).toBeInTheDocument();
    expect(screen.getByText("Senticor Project v0.1.0")).toBeInTheDocument();
  });

  it("does not render a standalone Sign out button in the header bar", () => {
    render(<AppHeader {...defaults} />);
    // Sign out is inside the menu, not visible until menu is opened
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("fires onNavigate('settings') when Settings is clicked in menu", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<AppHeader {...defaults} onNavigate={onNavigate} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Settings"));

    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("fires onNavigate('workspace') when Workspace is clicked in menu", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <AppHeader
        {...defaults}
        currentView="settings"
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Workspace"));

    expect(onNavigate).toHaveBeenCalledWith("workspace");
  });

  it("fires onSignOut when Sign out is clicked in menu", async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    render(<AppHeader {...defaults} onSignOut={onSignOut} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Sign out"));

    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("fires onLogoClick when logo is clicked", async () => {
    const onLogoClick = vi.fn();
    const user = userEvent.setup();
    render(<AppHeader {...defaults} onLogoClick={onLogoClick} />);

    await user.click(screen.getByLabelText("Go to Inbox"));

    expect(onLogoClick).toHaveBeenCalledOnce();
  });

  it("marks current view as active in menu", async () => {
    const user = userEvent.setup();
    render(<AppHeader {...defaults} currentView="settings" />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    const settingsItem = screen.getByText("Settings").closest("button");
    expect(settingsItem?.className).toContain("bg-blueprint-50");

    const workspaceItem = screen.getByText("Workspace").closest("button");
    expect(workspaceItem?.className).not.toContain("bg-blueprint-50");
  });

  it("shows Install app item when canInstall is true", async () => {
    const user = userEvent.setup();
    render(<AppHeader {...defaults} canInstall onInstall={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    expect(screen.getByText("Install app")).toBeInTheDocument();
  });

  it("does not show Install app item when canInstall is false", async () => {
    const user = userEvent.setup();
    render(<AppHeader {...defaults} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    expect(screen.queryByText("Install app")).not.toBeInTheDocument();
  });

  it("fires onInstall when Install app is clicked", async () => {
    const onInstall = vi.fn();
    const user = userEvent.setup();
    render(<AppHeader {...defaults} canInstall onInstall={onInstall} />);

    await user.click(screen.getByRole("button", { name: "Main menu" }));
    await user.click(screen.getByText("Install app"));

    expect(onInstall).toHaveBeenCalledOnce();
  });

  describe("AppHeader chat toggle", () => {
    it("renders chat toggle button when onToggleChat is provided", () => {
      render(<AppHeader {...defaults} onToggleChat={vi.fn()} />);
      expect(
        screen.getByRole("button", { name: "Chat mit Copilot" }),
      ).toBeInTheDocument();
    });

    it("fires onToggleChat when chat button is clicked", async () => {
      const onToggleChat = vi.fn();
      const user = userEvent.setup();
      render(<AppHeader {...defaults} onToggleChat={onToggleChat} />);

      await user.click(
        screen.getByRole("button", { name: "Chat mit Copilot" }),
      );

      expect(onToggleChat).toHaveBeenCalledOnce();
    });

    it("shows minimize label when chat is open", () => {
      render(
        <AppHeader {...defaults} onToggleChat={vi.fn()} isChatOpen={true} />,
      );
      expect(
        screen.getByRole("button", { name: "Chat minimieren" }),
      ).toBeInTheDocument();
    });

    it("shows tooltip on hover", async () => {
      const user = userEvent.setup();
      render(<AppHeader {...defaults} onToggleChat={vi.fn()} />);

      await user.hover(
        screen.getByRole("button", { name: "Chat mit Copilot" }),
      );

      // Tooltip derives text from aria-label
      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip).toHaveTextContent("Chat mit Copilot");
    });
  });
});

describe("AppHeader chat toggle", () => {
  it("renders chat toggle when onToggleChat is provided", () => {
    render(<AppHeader {...defaults} onToggleChat={vi.fn()} />);
    expect(screen.getByLabelText("Chat mit Copilot")).toBeInTheDocument();
  });

  it("fires onToggleChat when chat button is clicked", async () => {
    const onToggleChat = vi.fn();
    const user = userEvent.setup();
    render(<AppHeader {...defaults} onToggleChat={onToggleChat} />);

    await user.click(screen.getByLabelText("Chat mit Copilot"));
    expect(onToggleChat).toHaveBeenCalledOnce();
  });

  it("shows minimize label when chat is open", () => {
    render(
      <AppHeader {...defaults} onToggleChat={vi.fn()} isChatOpen={true} />,
    );
    expect(screen.getByLabelText("Chat minimieren")).toBeInTheDocument();
  });

  it("shows tooltip on chat toggle hover", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AppHeader {...defaults} onToggleChat={vi.fn()} />);

    const wrapper = screen.getByLabelText("Chat mit Copilot").closest("span")!;
    await userEvent.hover(wrapper);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByRole("tooltip")).toHaveTextContent("Chat mit Copilot");
    vi.useRealTimers();
  });
});
